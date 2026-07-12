import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { RotateCw, MailOpen } from 'lucide-react';
import { toast } from 'sonner';

interface EmailStatusProps {
  lead: {
    _id?: string;
    emailSequenceActive?: boolean;
    emailSequenceStage?: string;
    emailSequenceStep?: number;
    emailStatus?: string;
    emailRetryCount?: number;
    emailFailureCount?: number;
    emailLastAttempt?: Date;
    nextScheduledEmail?: Date;
    emailErrors?: Array<{
      attempt: number;
      error: string;
      timestamp: Date;
    }>;
    emailHistory?: Array<{
      stage: string;
      sentAt: Date;
      status: string;
      retryCount?: number;
    }>;
    emailOpenStats?: {
      totalSent: number;
      totalOpened: number;
      openedStages: string[];
      lastOpenedAt: Date | null;
    };
  };
  onRefresh?: () => void; // Optional callback to refresh lead data
}

const EmailStatus: React.FC<EmailStatusProps> = ({ lead, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getLatestError = () => {
    if (!lead.emailErrors || lead.emailErrors.length === 0) return null;
    return lead.emailErrors[lead.emailErrors.length - 1];
  };

  const isUndeliverableError = (message: string) => {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized.includes('user unknown') ||
      normalized.includes('mailbox unavailable') ||
      normalized.includes('recipient address rejected') ||
      normalized.includes('invalid recipient') ||
      normalized.includes('no such user') ||
      normalized.includes('no such mailbox') ||
      normalized.includes('550') ||
      normalized.includes('551') ||
      normalized.includes('552') ||
      normalized.includes('553') ||
      normalized.includes('554')
    );
  };

  // Refresh lead timing with new settings from email-prompting
  const handleRefreshTiming = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!lead._id) {
      toast.error('Lead ID not available');
      return;
    }

    setIsRefreshing(true);

    try {
      const response = await fetch('/api/refresh-lead-timing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId: lead._id }),
      });

      const result = await response.json();

      if (result.success) {
        const data = result.data;
        console.log('🔄 Refresh result:', data);
        toast.success(`✅ Lead timing refreshed! Next email: ${data.timingSettings?.delay} ${data.timingSettings?.unit} from last email`);
        if (onRefresh) {
          onRefresh(); // Trigger parent component to refresh data
        }
      } else {
        toast.error(`❌ Failed to refresh timing: ${result.error}`);
      }
    } catch (error) {
      console.error('Error refreshing lead timing:', error);
      toast.error('Failed to refresh lead timing');
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasSentHistory = (lead.emailHistory || []).some((entry) => entry?.status === 'sent');
  const latestError = getLatestError();
  const undeliverable = latestError ? isUndeliverableError(latestError.error) : false;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'inactive':
        return '⚫';
      case 'ready':
        return '🟡'; // Yellow circle for ready
      case 'processing':
        return '🔄';
      case 'sending':
        return '🔄'; // Refresh icon for sending
      case 'sent':
        return '✅'; // Green check for sent
      case 'completed':
        return '✅';
      case 'failed':
        return undeliverable ? '📭' : '❌';
      case 'max_retries_exceeded':
        return undeliverable ? '📭' : '🚫';
      default:
        return '⚪'; // White circle for unknown
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'inactive':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'ready':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'sending':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'sent':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return undeliverable
          ? 'bg-orange-100 text-orange-800 border-orange-200'
          : 'bg-red-100 text-red-800 border-red-200';
      case 'max_retries_exceeded':
        return undeliverable
          ? 'bg-orange-100 text-orange-800 border-orange-200'
          : 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'inactive') return 'Inactive';
    if (status === 'ready') return 'Ready';
    if (status === 'processing') return 'Processing';
    if (status === 'sending') return 'Sending';
    if (status === 'sent') return 'Sent';
    if (status === 'completed') return 'Completed';
    if (status === 'failed') return undeliverable ? 'Undeliverable' : 'Failed';
    if (status === 'max_retries_exceeded') return undeliverable ? 'Undeliverable' : 'Stopped';
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const formatStage = (stage: string) => {
    const stageMap: { [key: string]: string } = {
      'called_once': 'Email 1',
      'called_twice': 'Email 2',
      'called_three_times': 'Email 3',
      'called_four_times': 'Email 4',
      'called_five_times': 'Email 5',
      'called_six_times': 'Email 6',
      'called_seven_times': 'Email 7'
    };
    return stageMap[stage] || stage;
  };

  const getNextEmailTime = () => {
    if (!lead.nextScheduledEmail) {
      // If no schedule but ready status, it should send immediately
      if (status === 'ready') return 'Now';
      return null;
    }
    
    const now = new Date();
    const scheduled = new Date(lead.nextScheduledEmail);
    const diffMs = scheduled.getTime() - now.getTime();
    
    // If scheduled time is in the past by more than 5 minutes, show "Pending"
    if (diffMs < -300000) return 'Pending'; // -5 minutes
    
    if (diffMs <= 0) return 'Now';
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return `${diffMinutes}m`;
  };

  const currentStage = lead.emailSequenceStage || 'not_called';
  const currentStep = lead.emailSequenceStep || 0;
  const status = lead.emailStatus || (hasSentHistory ? 'sent' : (lead.emailSequenceActive ? 'ready' : 'inactive'));
  const retryCount = lead.emailRetryCount || 0;
  const failureCount = lead.emailFailureCount || 0;
  const nextEmailTime = getNextEmailTime();

  const getStatusDescription = (status: string) => {
    switch (status) {
      case 'inactive':
        return hasSentHistory ? 'Email sequence inactive (already sent before)' : 'No active email automation';
      case 'ready':
        return 'Ready to send email (waiting for cron job)';
      case 'processing':
        return 'Picked by automation worker and preparing send';
      case 'sending':
        return 'Currently sending email';
      case 'sent':
        return 'Email sent successfully';
      case 'completed':
        return 'Email sequence completed';
      case 'failed':
        return undeliverable
          ? 'Email not deliverable (recipient mailbox rejected)'
          : 'Email sending failed (will retry)';
      case 'max_retries_exceeded':
        return undeliverable
          ? 'Email not deliverable and retries stopped'
          : 'Max retry attempts reached';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
    }
  };

  const tooltipContent = (
    <div className="space-y-2 text-sm max-w-xs">
      <div>
        <strong>Status:</strong> {getStatusDescription(status)}
      </div>
      {undeliverable && (
        <div>
          <strong>Delivery:</strong> Not deliverable (recipient rejected)
        </div>
      )}
      {currentStage !== 'not_called' && (
        <div>
          <strong>Current Stage:</strong> {formatStage(currentStage)} (Step {currentStep}/7)
        </div>
      )}
      {retryCount > 0 && (
        <div>
          <strong>Retry Count:</strong> {retryCount}/10
        </div>
      )}
      {failureCount > 0 && (
        <div>
          <strong>Total Failures:</strong> {failureCount}
        </div>
      )}
      {nextEmailTime && (
        <div>
          <strong>{status === 'ready' ? 'Sends In:' : 'Next Email:'}</strong> {nextEmailTime}
          {nextEmailTime === 'Pending' && (
            <div className="text-xs text-orange-600 mt-1">
              Email is overdue - cron job will process it soon
            </div>
          )}
          {nextEmailTime === 'Now' && status === 'ready' && (
            <div className="text-xs text-blue-600 mt-1">
              Email scheduled for immediate sending
            </div>
          )}
        </div>
      )}
      {lead.emailLastAttempt && (
        <div>
          <strong>Last Attempt:</strong> {new Date(lead.emailLastAttempt).toLocaleDateString()}
        </div>
      )}
      {lead.emailErrors && lead.emailErrors.length > 0 && (
        <div className="mt-2 pt-2 border-t">
          <strong>Recent Errors:</strong>
          <div className="text-xs text-gray-600 mt-1">
            {lead.emailErrors.slice(-2).map((error, index) => (
              <div key={index} className="truncate">
                Attempt {error.attempt}: {error.error.substring(0, 50)}...
              </div>
            ))}
          </div>
        </div>
      )}
      {lead.emailOpenStats && lead.emailOpenStats.totalSent > 0 && (
        <div className="mt-2 pt-2 border-t">
          <strong>Email Opens:</strong>
          <div className="text-xs text-gray-600 mt-1">
            {lead.emailOpenStats.totalOpened} of {lead.emailOpenStats.totalSent} emails opened
            {lead.emailOpenStats.lastOpenedAt && (
              <div>Last opened: {new Date(lead.emailOpenStats.lastOpenedAt).toLocaleString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center space-x-2">
            <Badge 
              variant="outline" 
              className={`text-xs border ${getStatusColor(status)}`}
            >
              <span className="mr-1">{getStatusIcon(status)}</span>
              {getStatusLabel(status)}
              {retryCount > 0 && (
                <span className="ml-1 text-xs opacity-75">
                  (Retry {retryCount})
                </span>
              )}
            </Badge>
            
            {/* Progress indicator for 7-step sequence */}
            <div className="flex space-x-1">
              {Array.from({ length: 7 }, (_, index) => {
                const stepNumber = index + 1;
                const isCompleted = currentStep > stepNumber;
                const isCurrent = currentStep === stepNumber;
                const isFailed = isCurrent && (status === 'failed' || status === 'max_retries_exceeded');
                
                return (
                  <div
                    key={stepNumber}
                    className={`w-2 h-2 rounded-full ${
                      isCompleted
                        ? 'bg-green-500'
                        : isCurrent
                        ? isFailed
                          ? 'bg-red-500'
                          : status === 'sending'
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-yellow-500'
                        : 'bg-gray-300'
                    }`}
                    title={`Step ${stepNumber}`}
                  />
                );
              })}
            </div>

            {/* Failure count indicator */}
            {failureCount > 0 && (
              <div className="flex items-center text-xs text-red-600">
                <span className="mr-1">⚠️</span>
                {failureCount}
              </div>
            )}

            {/* Email open tracking indicator */}
            {lead.emailOpenStats && lead.emailOpenStats.totalSent > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 text-xs cursor-help ${
                    lead.emailOpenStats.totalOpened > 0 ? 'text-blue-600' : 'text-gray-400'
                  }`}>
                    <MailOpen className={`h-3.5 w-3.5 ${
                      lead.emailOpenStats.totalOpened > 0 ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                    <span>{lead.emailOpenStats.totalOpened}/{lead.emailOpenStats.totalSent}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1 text-xs">
                    <div><strong>Email Open Tracking</strong></div>
                    <div>Sent: {lead.emailOpenStats.totalSent}</div>
                    <div>Opened: {lead.emailOpenStats.totalOpened}</div>
                    {lead.emailOpenStats.openedStages.length > 0 && (
                      <div>Opened stages: {lead.emailOpenStats.openedStages.map(s => formatStage(s)).join(', ')}</div>
                    )}
                    {lead.emailOpenStats.lastOpenedAt && (
                      <div>Last opened: {new Date(lead.emailOpenStats.lastOpenedAt).toLocaleString()}</div>
                    )}
                    {lead.emailOpenStats.totalOpened === 0 && (
                      <div className="text-gray-500">No emails opened yet</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Next email timing */}
            {nextEmailTime && (
              <div className="flex items-center gap-1">
                <div className={`text-xs ${
                  nextEmailTime === 'Pending' ? 'text-orange-600' : 
                  nextEmailTime === 'Now' ? 'text-blue-600' : 
                  'text-gray-500'
                }`}>
                  {status === 'ready' ? 'Sends: ' : 'Next: '}{nextEmailTime}
                </div>
                
                {/* Refresh timing button - only show for active automation */}
                {lead._id && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 hover:bg-gray-100"
                        onClick={handleRefreshTiming}
                        disabled={isRefreshing}
                      >
                        <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        Refresh timing with current Email Prompting settings
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default EmailStatus; 