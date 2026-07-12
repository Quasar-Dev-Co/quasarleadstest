"use client";

import { useState, useEffect } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Mail, 
  Send, 
  RefreshCw, 
  Bot, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Eye,
  Edit,
  Sparkles,
  Building,
  ArrowRight,
  Copy,
  Save,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useEmailResponseTranslations } from "@/hooks/use-email-response-translations";
import { auth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Type definitions
interface CombinedEmailData {
  email: {
    id: string;
    leadId: string;
    leadName: string;
    leadEmail: string;
    leadCompany: string;
    subject: string;
    content: string;
    receivedAt: string;
    status: 'unread' | 'pending_ai' | 'responded';
    sentiment: string;
    isReply: boolean;
    conversationCount: number;
    isThirdReply: boolean;
    metadata?: any;
  };
  aiResponse: {
    id: string;
    generatedSubject: string;
    generatedContent: string;
    status: 'draft' | 'sent' | 'failed';
    reasoning: string;
    responseType: string;
    createdAt: string;
    sentAt?: string;
  } | null;
}

export default function EmailResponsesNew() {
  const { t, currentLanguage } = useEmailResponseTranslations();
  const tf = (key: string, values?: Record<string, string | number>) => {
    let text = t(key);
    if (!values) return text;
    Object.entries(values).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, String(value));
    });
    return text;
  };
  
  // State management
  const [emailData, setEmailData] = useState<CombinedEmailData[]>([]);
  const [selectedItem, setSelectedItem] = useState<CombinedEmailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  
  // Editing state
  const [editedSubject, setEditedSubject] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<any>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);

  // Auto Reply toggle state
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyToggling, setAutoReplyToggling] = useState(false);

  // Credentials gating
  const [credsLoading, setCredsLoading] = useState(true);
  const [missingCreds, setMissingCreds] = useState<string[]>([]);
  const requiredCreds = [
    'IMAP_HOST','IMAP_PORT','IMAP_USER','IMAP_PASSWORD',
    'SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD',
    'OPENAI_API_KEY'
  ];

  // Load AI settings
  const loadAiSettings = async () => {
    try {
      setAiSettingsLoading(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/email-responses/settings', {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAiSettings(data.settings);
        setAutoReplyEnabled(data.settings.autoReplyEnabled || false);
      } else {
        toast.error(tf('failedToLoadAiSettingsWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorLoadingAiSettingsWithError', { error: error.message }));
    } finally {
      setAiSettingsLoading(false);
    }
  };

  // Save AI settings
  const saveAiSettings = async () => {
    try {
      setAiSettingsSaving(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/email-responses/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(aiSettings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`✅ ${t('settingsSaved')}`);
        loadAiSettings(); // Reload
      } else {
        toast.error(tf('failedToSaveWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorWithMessage', { error: error.message }));
    } finally {
      setAiSettingsSaving(false);
    }
  };

  // Load credentials
  useEffect(() => {
    (async () => {
      try {
        setCredsLoading(true);
        const authHeader = auth.getAuthHeader();
        const res = await fetch('/api/credentials', {
          headers: authHeader ? { Authorization: authHeader } : undefined,
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const missing = requiredCreds.filter((k) => !data.credentials || !data.credentials[k]);
          setMissingCreds(missing);
        } else {
          console.error('API Error:', data.error);
          toast.error(tf('failedToLoadCredentialsWithError', { error: data.error || t('unknownError') }));
          setMissingCreds(requiredCreds);
        }
      } catch (error: any) {
        console.error('Error loading credentials:', error);
        toast.error(tf('failedToLoadCredentialsWithError', { error: error.message || t('networkError') }));
        setMissingCreds(requiredCreds);
      } finally {
        setCredsLoading(false);
      }
    })();
  }, []);

  const credsOK = !credsLoading && missingCreds.length === 0;

  // Toggle Auto Reply
  const toggleAutoReply = async (enabled: boolean) => {
    try {
      setAutoReplyToggling(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/email-responses/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ ...aiSettings, autoReplyEnabled: enabled }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAutoReplyEnabled(enabled);
        setAiSettings(data.settings);
        toast.success(enabled ? '✅ Auto Reply enabled — drafts will be sent automatically' : '⛔ Auto Reply disabled — manual review required');
      } else {
        toast.error(`Failed to toggle: ${data.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setAutoReplyToggling(false);
    }
  };

  // Load combined email data
  useEffect(() => {
    if (credsOK) {
      loadEmailData();
      loadAiSettings(); // Load AI settings too
    }
  }, [credsOK]);

  const loadEmailData = async () => {
    try {
      setLoading(true);
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/combined', {
        headers: authHeader ? { Authorization: authHeader } : {}
      });
      const data = await response.json();
      
      if (data.success) {
        setEmailData(data.data || []);
        console.log(`📧 Loaded ${data.count} emails with responses`);
      } else {
        console.error('API Error:', data.error);
        toast.error(tf('failedToLoadEmailDataWithError', { error: data.error || t('unknownError') }));
      }
    } catch (error: any) {
      console.error('Error loading email data:', error);
      toast.error(tf('failedToLoadEmailDataWithError', { error: error.message || t('networkError') }));
    } finally {
      setLoading(false);
    }
  };

  // Generate AI response for email without response
  const generateResponse = async (emailId: string) => {
    try {
      setGenerating(true);
      const loadingToast = toast.loading(`🤖 ${t('generatingAiResponseToast')}`);
      
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify({ incomingEmailId: emailId })
      });

      const data = await response.json();
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      if (data.success) {
        toast.success(`✅ ${t('responseGenerated')}`);
        loadEmailData(); // Reload to get the new response
      } else {
        toast.error(tf('failedWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorWithMessage', { error: error.message }));
    } finally {
      setGenerating(false);
    }
  };

  // Send the AI response
  const sendResponse = async () => {
    if (!selectedItem?.aiResponse) return;
    
    try {
      setSending(true);
      const loadingToast = toast.loading(`📧 ${t('sendingEmailToast')}`);
      
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {})
        },
        body: JSON.stringify({
          responseId: selectedItem.aiResponse.id,
          customSubject: editedSubject || selectedItem.aiResponse.generatedSubject,
          customContent: editedContent || selectedItem.aiResponse.generatedContent
        })
      });

      const data = await response.json();
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      if (data.success) {
        toast.success(`✅ ${t('responseSent')}`);
        setShowPreviewDialog(false);
        loadEmailData(); // Reload data
      } else {
        toast.error(tf('failedWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorWithMessage', { error: error.message }));
    } finally {
      setSending(false);
    }
  };

  // Open preview dialog
  const openPreview = (item: CombinedEmailData) => {
    setSelectedItem(item);
    setEditedSubject(item.aiResponse?.generatedSubject || '');
    setEditedContent(item.aiResponse?.generatedContent || '');
    setIsEditing(false);
    setShowPreviewDialog(true);
  };

  // Save edited content without sending
  const saveEdits = async () => {
    if (!selectedItem?.aiResponse) return;
    
    try {
      setSaving(true);
      const loadingToast = toast.loading(`💾 ${t('savingChangesToast')}`);
      
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          responseId: selectedItem.aiResponse.id,
          generatedSubject: editedSubject,
          generatedContent: editedContent
        })
      });

      const data = await response.json();
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      if (data.success) {
        toast.success(`✅ ${t('changesSavedSuccessfully')}`);
        loadEmailData(); // Reload data
      } else {
        toast.error(tf('failedToSaveWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorWithMessage', { error: error.message }));
    } finally {
      setSaving(false);
    }
  };

  // Direct send without opening dialog
  const directSend = async (item: CombinedEmailData) => {
    if (!item.aiResponse) return;
    
    try {
      setSending(true);
      const loadingToast = toast.loading(`📧 ${t('sendingEmailToast')}`);
      
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          responseId: item.aiResponse.id,
          incomingEmailId: item.email.id
        })
      });

      const data = await response.json();
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      if (data.success) {
        toast.success(`✅ ${t('responseSent')}`);
        loadEmailData(); // Reload data
      } else {
        toast.error(tf('failedWithError', { error: data.error }));
      }
    } catch (error: any) {
      toast.error(tf('errorWithMessage', { error: error.message }));
    } finally {
      setSending(false);
    }
  };

  // Refresh data
  const handleRefresh = () => {
    setRefreshing(true);
    loadEmailData().then(() => {
      setRefreshing(false);
      toast.success(`🔄 ${t('refreshed')}`);
    });
  };

  const deleteMessage = async (item: CombinedEmailData) => {
    const confirmed = confirm(t('deleteMessageConfirm'));
    if (!confirmed) return;

    try {
      setDeletingEmailId(item.email.id);
      const loadingToast = toast.loading(`🗑️ ${t('deletingMessageToast')}`);

      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/email-responses/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ incomingEmailId: item.email.id })
      });

      const data = await response.json();
      toast.dismiss(loadingToast);

      if (data.success) {
        toast.success(`✅ ${t('messageDeletedSuccessfully')}`);
        if (selectedItem?.email.id === item.email.id) {
          setShowPreviewDialog(false);
          setSelectedItem(null);
        }
        await loadEmailData();
      } else {
        toast.error(tf('failedToDeleteWithError', { error: data.error || t('unknownError') }));
      }
    } catch (error: any) {
      toast.error(tf('errorDeletingMessageWithError', { error: error.message || t('unknownError') }));
    } finally {
      setDeletingEmailId(null);
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const variants = {
      'draft': 'bg-yellow-100 text-yellow-800',
      'sent': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
      'pending_ai': 'bg-blue-100 text-blue-800',
      'unread': 'bg-orange-100 text-orange-800',
      'responded': 'bg-green-100 text-green-800'
    };
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  // Filter emails by tab
  const filteredData = emailData.filter(item => {
    // Pending tab: has draft response
    // Sent tab: has sent response
    // All tab: everything
    return true; // We'll filter in TabsContent
  });

  const newEmailCount = emailData.filter(item => !item.aiResponse || item.email.status === 'unread').length;
  const pendingCount = emailData.filter(item => item.aiResponse?.status === 'draft').length;
  const sentCount = emailData.filter(item => item.aiResponse?.status === 'sent').length;
  const unreadCount = emailData.filter(item => item.email.status === 'unread').length;

  if (credsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-400">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" /> {t('loading')}
      </div>
    );
  }

  if (!credsOK) {
    return (
      <div className="space-y-8 p-6">
        <SectionHeader title={t('emailResponses')} description={t('manageEmailResponses')} />
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> {t('missingCredentials')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-red-800">
            <p>{t('missingRequiredCredentials')}</p>
            <ul className="list-disc ml-6">
              {missingCreds.map((k) => (<li key={k}>{k}</li>))}
            </ul>
            <Button onClick={() => window.location.assign('/account-settings')}>
              {t('goToCredentials')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <SectionHeader
          title={`📧 ${t('emailResponseManager')}`}
          description={t('emailResponseManagerDescription')}
        />
        <div className="flex items-center gap-4">
          {/* Auto Reply Switch */}
          <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2">
            <span className="text-xs text-zinc-400 font-medium">Auto Reply</span>
            <Switch
              checked={autoReplyEnabled}
              onCheckedChange={toggleAutoReply}
              disabled={autoReplyToggling}
              className={cn(
                "data-[state=checked]:bg-green-600",
                "bg-gray-300"
              )}
            />
            <span className={cn("text-xs font-medium", autoReplyEnabled ? "text-green-400" : "text-zinc-500")}>
              {autoReplyEnabled ? "ON" : "OFF"}
            </span>
          </div>
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">{t('newEmailStat')}</p>
                <p className="text-2xl font-bold text-zinc-200">{newEmailCount}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">{t('readyStat')}</p>
                <p className="text-2xl font-bold text-zinc-200">{pendingCount}</p>
              </div>
              <Bot className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">{t('sentStat')}</p>
                <p className="text-2xl font-bold text-zinc-200">{sentCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400">{t('allStat')}</p>
                <p className="text-2xl font-bold text-zinc-200">{emailData.length}</p>
              </div>
              <Mail className="h-8 w-8 text-zinc-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="bg-zinc-900/50 border-zinc-700">
        <CardContent className="p-6">
          <Tabs defaultValue="new">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="new">
                {t('newEmailStat')} ({newEmailCount})
              </TabsTrigger>
              <TabsTrigger value="ready">
                {t('readyStat')} ({pendingCount})
              </TabsTrigger>
              <TabsTrigger value="sent">
                {t('sentStat')} ({sentCount})
              </TabsTrigger>
              <TabsTrigger value="all">
                {t('allStat')} ({emailData.length})
              </TabsTrigger>
            </TabsList>

            {/* New Email Tab */}
            <TabsContent value="new" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {emailData
                    .filter(item => !item.aiResponse || item.email.status === 'unread')
                    .map((item) => (
                      <EmailResponseCard
                        key={item.email.id}
                        item={item}
                        onView={openPreview}
                        onGenerate={generateResponse}
                        onDirectSend={directSend}
                        onDelete={deleteMessage}
                        deletingEmailId={deletingEmailId}
                        generating={generating}
                        sending={sending}
                      />
                    ))}
                  {emailData.filter(item => !item.aiResponse || item.email.status === 'unread').length === 0 && (
                    <div className="text-center py-12 text-zinc-400">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{t('noNewEmails')}</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Ready to Send Tab */}
            <TabsContent value="ready" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {emailData
                    .filter(item => item.aiResponse?.status === 'draft')
                    .map((item) => (
                      <EmailResponseCard
                        key={item.email.id}
                        item={item}
                        onView={openPreview}
                        onGenerate={generateResponse}
                        onDirectSend={directSend}
                        onDelete={deleteMessage}
                        deletingEmailId={deletingEmailId}
                        generating={generating}
                        sending={sending}
                      />
                    ))}
                  {emailData.filter(item => item.aiResponse?.status === 'draft').length === 0 && (
                    <div className="text-center py-12">
                      <CheckCircle className="h-16 w-16 text-zinc-400 mx-auto mb-4" />
                      <p className="text-zinc-400">{t('noEmailsReadyToSend')}</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Sent Tab */}
            <TabsContent value="sent" className="mt-6">
              <div className="space-y-4">
                {emailData
                  .filter(item => item.aiResponse?.status === 'sent')
                  .map((item) => (
                    <EmailResponseCard
                      key={item.email.id}
                      item={item}
                      onView={openPreview}
                      onGenerate={generateResponse}
                      onDirectSend={directSend}
                      onDelete={deleteMessage}
                      deletingEmailId={deletingEmailId}
                      generating={generating}
                      sending={sending}
                    />
                  ))}
                {emailData.filter(item => item.aiResponse?.status === 'sent').length === 0 && (
                  <div className="text-center py-12">
                    <Mail className="h-16 w-16 text-zinc-400 mx-auto mb-4" />
                    <p className="text-zinc-400">{t('noSentEmails')}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* All Tab */}
            <TabsContent value="all" className="mt-6">
              <div className="space-y-4">
                {emailData.map((item) => (
                  <EmailResponseCard
                    key={item.email.id}
                    item={item}
                    onView={openPreview}
                    onGenerate={generateResponse}
                    onDirectSend={directSend}
                    onDelete={deleteMessage}
                    deletingEmailId={deletingEmailId}
                    generating={generating}
                    sending={sending}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* AI Settings Section - Separate card below */}
      <Card className="bg-zinc-900/50 border-zinc-700">
        <CardHeader>
          <CardTitle className="text-zinc-200 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            {t('aiSettings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-6">
              {aiSettingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              ) : aiSettings ? (
                <div className="space-y-6">
                  <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700">
                    <h3 className="text-lg font-semibold text-zinc-200 mb-2 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-400" />
                      {t('aiResponseConfiguration')}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      {t('aiResponseConfigurationDescription')}
                    </p>
                  </div>

                  {/* Company Information */}
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardHeader>
                      <CardTitle className="text-zinc-200 flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        {t('companyInformation')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-zinc-300">{t('companyName')}</Label>
                          <Input
                            value={aiSettings.companyName || ''}
                            onChange={(e) => setAiSettings({ ...aiSettings, companyName: e.target.value })}
                            className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1"
                            placeholder="QuasarSEO"
                          />
                        </div>
                        <div>
                          <Label className="text-zinc-300">{t('senderName')}</Label>
                          <Input
                            value={aiSettings.senderName || ''}
                            onChange={(e) => setAiSettings({ ...aiSettings, senderName: e.target.value })}
                            className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1"
                            placeholder="Team QuasarSEO"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-zinc-300">{t('senderEmail')}</Label>
                        <Input
                          type="email"
                          value={aiSettings.senderEmail || ''}
                          onChange={(e) => setAiSettings({ ...aiSettings, senderEmail: e.target.value })}
                          className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1"
                          placeholder="info@quasarseo.nl"
                        />
                      </div>
                      <div>
                        <Label className="text-zinc-300">{t('emailSignature')}</Label>
                        <Textarea
                          value={aiSettings.signature || ''}
                          onChange={(e) => setAiSettings({ ...aiSettings, signature: e.target.value })}
                          className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1 min-h-[80px]"
                          placeholder={t('emailSignaturePlaceholder')}
                        />
                        <p className="text-xs text-zinc-400 mt-1">
                          {t('signatureAppendedDescription')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Behavior Settings */}
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardHeader>
                      <CardTitle className="text-zinc-200 flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        {t('aiBehaviorSettings')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label className="text-zinc-300">{t('tone')}</Label>
                          <select
                            value={aiSettings.defaultTone || 'professional'}
                            onChange={(e) => setAiSettings({ ...aiSettings, defaultTone: e.target.value })}
                            className="w-full mt-1 bg-zinc-900 border border-zinc-600 text-zinc-200 rounded-md px-3 py-2"
                          >
                            <option value="professional">{t('professional')}</option>
                            <option value="friendly">{t('friendly')}</option>
                            <option value="casual">{t('casual')}</option>
                            <option value="formal">{t('formal')}</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-zinc-300">{t('maxResponseLengthWords')}</Label>
                          <Input
                            type="number"
                            min="50"
                            max="1000"
                            value={aiSettings.maxResponseLength || 300}
                            onChange={(e) => setAiSettings({ ...aiSettings, maxResponseLength: parseInt(e.target.value) || 300 })}
                            className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-zinc-300">{t('autoSendThresholdPercent')}</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={aiSettings.autoSendThreshold || 85}
                            onChange={(e) => setAiSettings({ ...aiSettings, autoSendThreshold: parseInt(e.target.value) || 85 })}
                            className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1"
                            disabled
                          />
                          <p className="text-xs text-zinc-400 mt-1">
                            🔒 {t('autoSendDisabledDrafts')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={aiSettings.isEnabled !== false}
                          onChange={(e) => setAiSettings({ ...aiSettings, isEnabled: e.target.checked })}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-purple-500"
                        />
                        <Label className="text-zinc-300 cursor-pointer">
                          {t('enableAiResponseGeneration')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={aiSettings.includeCompanyInfo !== false}
                          onChange={(e) => setAiSettings({ ...aiSettings, includeCompanyInfo: e.target.checked })}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-purple-500"
                        />
                        <Label className="text-zinc-300 cursor-pointer">
                          {t('includeCompanyInfoInResponses')}
                        </Label>
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Prompt Configuration */}
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardHeader>
                      <CardTitle className="text-zinc-200 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        {t('aiPromptConfiguration')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-zinc-300">{t('responsePromptTemplate')}</Label>
                        <Textarea
                          value={aiSettings.responsePrompt || ''}
                          onChange={(e) => setAiSettings({ ...aiSettings, responsePrompt: e.target.value })}
                          className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1 min-h-[300px] font-mono text-sm"
                          placeholder={t('responsePromptTemplatePlaceholder')}
                        />
                        <p className="text-xs text-zinc-400 mt-1">
                          {t('responsePromptTemplateDescription')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-zinc-300">{t('customInstructionsOptional')}</Label>
                        <Textarea
                          value={aiSettings.customInstructions || ''}
                          onChange={(e) => setAiSettings({ ...aiSettings, customInstructions: e.target.value })}
                          className="bg-zinc-900 border-zinc-600 text-zinc-200 mt-1 min-h-[100px]"
                          placeholder={t('customInstructionsOptionalPlaceholder')}
                        />
                        <p className="text-xs text-zinc-400 mt-1">
                          {t('customInstructionsOptionalDescription')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={saveAiSettings}
                      disabled={aiSettingsSaving}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {aiSettingsSaving ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t('saving')}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {t('saveAiSettings')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-400">
                  <p>{t('failedToLoadSettings')}</p>
                  <Button onClick={loadAiSettings} variant="outline" className="mt-4">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('retry')}
                  </Button>
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Preview/Send Dialog - Gmail Style */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="!w-[90vw] !h-[95vh] !max-w-[90vw] !max-h-[95vh] bg-zinc-900 border-zinc-700 flex flex-col p-0" style={{ width: '90vw', height: '95vh', maxWidth: '90vw', maxHeight: '95vh' }}>
          <DialogHeader className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
            <DialogTitle className="text-zinc-200 flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t('reviewEmailsGmailStyle')}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {t('reviewEmailsGmailStyleDescription')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="flex-1 overflow-hidden px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                {/* LEFT: Incoming Email - Gmail Style */}
                <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col h-full">
                  {/* Gmail Header */}
                  <div className="bg-[#f5f5f5] border-b border-gray-300 px-4 py-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">{t('incomingEmail')}</span>
                    </div>
                  </div>
                  
                  {/* Gmail Email Header */}
                  <div className="bg-white p-5 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-2xl font-normal text-gray-900 mb-3">
                      {selectedItem.email.subject}
                    </h2>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                        {selectedItem.email.leadName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-base">
                            {selectedItem.email.leadName}
                          </span>
                          <span className="text-gray-500 text-sm">
                            &lt;{selectedItem.email.leadEmail}&gt;
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {t('toMe')}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {new Date(selectedItem.email.receivedAt).toLocaleString(currentLanguage === 'nl' ? 'nl-NL' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Gmail Email Body */}
                  <div className="p-6 bg-white overflow-y-auto flex-1">
                    <div className="text-base text-gray-900 leading-relaxed">
                      {(() => {
                        const content = selectedItem.email.content;
                        // Check if email contains quoted text (starts with > or contains "wrote:")
                        const hasQuotedText = content.includes('\n>') || content.includes('wrote:');
                        
                        if (hasQuotedText) {
                          // Split by common quote indicators
                          const parts = content.split(/(?=On .+? wrote:)/);
                          
                          return (
                            <>
                              {parts[0] && parts[0].trim() && (
                                <div className="mb-6">
                                  <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-sm font-semibold px-3 py-1.5 rounded-full mb-3">
                                    <span className="text-lg">📝</span>
                                    {t('usersReply')}
                                  </div>
                                  <div className="bg-gradient-to-r from-green-50 to-green-50/30 border-l-4 border-green-500 p-5 rounded-lg shadow-sm">
                                    <p className="text-gray-900 whitespace-pre-wrap">{parts[0].trim()}</p>
                                  </div>
                                </div>
                              )}
                              {parts[1] && (
                                <div>
                                  <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1.5 rounded-full mb-3">
                                    <span className="text-lg">📧</span>
                                    {t('quotedOriginalEmailYourEmail')}
                                  </div>
                                  <div className="bg-gradient-to-r from-gray-50 to-gray-50/30 border-l-4 border-gray-400 p-5 rounded-lg shadow-sm">
                                    <div className="text-gray-700 space-y-2">
                                      {parts[1]
                                        .split('\n')
                                        .map((line, idx) => {
                                          // Remove leading > and trim
                                          const cleanLine = line.replace(/^>\s*/, '').trim();
                                          // Skip empty lines
                                          if (!cleanLine) return <div key={idx} className="h-2"></div>;
                                          return (
                                            <p key={idx} className="leading-relaxed">
                                              {cleanLine}
                                            </p>
                                          );
                                        })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        }
                        
                        // No quoted text, show as is
                        return <p className="whitespace-pre-wrap">{content}</p>;
                      })()}
                    </div>
                  </div>
                </div>

              {/* RIGHT: AI Response - Gmail Style */}
              {selectedItem.aiResponse && (
                <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col h-full">
                  {/* Gmail Header */}
                  <div className="bg-[#f5f5f5] border-b border-gray-300 px-4 py-3 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-gray-700">{t('aiResponse')}</span>
                        <Badge className="bg-yellow-100 text-yellow-800 text-xs">{t('draft')}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <Button
                            size="sm"
                            onClick={saveEdits}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold border-2 border-green-700"
                          >
                            {saving ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            {saving ? t('saving') : t('save')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => setIsEditing(!isEditing)}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold border-2 border-purple-700"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          {isEditing ? t('preview') : t('edit')}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div className="p-5 space-y-4 flex-1 overflow-y-auto bg-gray-50">
                      <div>
                        <Label className="text-gray-900 text-base font-semibold mb-2 block">{t('subject')}</Label>
                        <Input
                          value={editedSubject}
                          onChange={(e) => setEditedSubject(e.target.value)}
                          className="w-full text-base text-gray-900 bg-white border-2 border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-lg px-4 py-3"
                          placeholder={t('emailSubjectPlaceholderShort')}
                        />
                      </div>
                      <div className="flex-1 flex flex-col">
                        <Label className="text-gray-900 text-base font-semibold mb-2 block">{t('emailContentHtml')}</Label>
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="flex-1 min-h-[450px] text-sm text-gray-900 bg-white border-2 border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-lg px-4 py-3 font-mono resize-none"
                          placeholder={t('emailContentHtmlPlaceholder')}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Gmail Email Header */}
                      <div className="bg-white p-5 border-b border-gray-200 flex-shrink-0">
                        <h2 className="text-2xl font-normal text-gray-900 mb-3">
                          {editedSubject || selectedItem.aiResponse.generatedSubject}
                        </h2>
                        
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                            AI
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-base">
                                {t('you')}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {tf('toRecipient', { name: selectedItem.email.leadName })}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                              {t('draftSavedNotSent')}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Gmail Email Body */}
                      <div className="p-6 bg-white overflow-y-auto flex-1">
                        <div 
                          className="text-base text-gray-900 gmail-content leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: editedContent || selectedItem.aiResponse.generatedContent }}
                        />
                      </div>
                      
                      {/* AI Info Footer */}
                      <div className="p-4 bg-purple-50 border-t border-purple-200 flex-shrink-0">
                        <p className="text-sm text-purple-700">
                          <Bot className="h-4 w-4 inline mr-1" />
                          {selectedItem.aiResponse.reasoning}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
              </div>
            </div>
          )}
          
          <DialogFooter className="px-6 py-4 border-t border-zinc-700 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowPreviewDialog(false)}
              className="mr-2"
            >
              {t('close')}
            </Button>
            {selectedItem?.aiResponse?.status === 'draft' && (
              <Button
                onClick={sendResponse}
                disabled={sending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {sending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('sending')}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('sendEmail')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Email Response Card Component
function EmailResponseCard({ 
  item, 
  onView, 
  onGenerate,
  onDirectSend,
  onDelete,
  deletingEmailId,
  generating,
  sending 
}: { 
  item: CombinedEmailData; 
  onView: (item: CombinedEmailData) => void;
  onGenerate: (emailId: string) => void;
  onDirectSend: (item: CombinedEmailData) => void;
  onDelete: (item: CombinedEmailData) => void;
  deletingEmailId: string | null;
  generating: boolean;
  sending: boolean;
}) {
  const { t, currentLanguage } = useEmailResponseTranslations();
  const isDeleting = deletingEmailId === item.email.id;
  const emailStatusLabels: Record<string, string> = {
    unread: t('unread'),
    responded: t('responded'),
    pending_ai: t('pendingAI'),
  };
  const aiStatusLabels: Record<string, string> = {
    draft: t('draft'),
    sent: t('sentStat'),
    failed: t('failed'),
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'draft': 'bg-yellow-100 text-yellow-800',
      'sent': 'bg-green-100 text-green-800',
      'failed': 'bg-red-100 text-red-800',
      'pending_ai': 'bg-blue-100 text-blue-800',
      'unread': 'bg-orange-100 text-orange-800'
    };
    return variants[status as keyof typeof variants] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="bg-zinc-800/50 border-zinc-600 hover:bg-zinc-800/70 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Email Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-zinc-200 truncate">
                {item.email.leadName} ({item.email.leadCompany})
              </h3>
              <Badge className={getStatusBadge(item.email.status)}>
                {emailStatusLabels[item.email.status] || item.email.status}
              </Badge>
              {item.aiResponse && (
                <Badge className={getStatusBadge(item.aiResponse.status)}>
                  <Bot className="h-3 w-3 mr-1" />
                  {aiStatusLabels[item.aiResponse.status] || item.aiResponse.status}
                </Badge>
              )}
              {item.email.isThirdReply && (
                <Badge className="bg-orange-600 text-white">
                  🇳🇱 {t('dutchTemplate')}
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-zinc-300 font-medium mb-1">
              📧 {item.email.subject}
            </p>
            <p className="text-sm text-zinc-400 line-clamp-2 mb-2">
              {item.email.content}
            </p>
            
            {item.aiResponse && (
              <div className="bg-zinc-700/30 rounded p-2 mt-2">
                <p className="text-xs text-purple-300 font-medium mb-1">
                  <Bot className="h-3 w-3 inline mr-1" />
                  {t('aiResponseReady')}
                </p>
                <p className="text-xs text-zinc-400 line-clamp-1">
                  {item.aiResponse.generatedSubject}
                </p>
              </div>
            )}
            
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(item.email.receivedAt).toLocaleDateString(currentLanguage === 'nl' ? 'nl-NL' : 'en-US')}
              </span>
              <span>{item.email.leadEmail}</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-col gap-2">
            {item.aiResponse ? (
              <>
                {item.aiResponse.status === 'draft' ? (
                  <>
                    {/* Review Button - Opens popup */}
                    <Button
                      size="sm"
                      onClick={() => onView(item)}
                      variant="outline"
                      className="border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t('review')}
                    </Button>
                    
                    {/* Send Button - Direct send with loader */}
                    <Button
                      size="sm"
                      onClick={() => onDirectSend(item)}
                      disabled={sending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {sending ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      {sending ? t('sending') : t('send')}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onView(item)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t('view')}
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => onGenerate(item.email.id)}
                disabled={generating}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {generating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Bot className="h-4 w-4 mr-1" />
                    {t('generate')}
                  </>
                )}
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(item)}
              disabled={isDeleting}
              className="border-red-600 text-red-600 hover:bg-red-50"
            >
              {isDeleting ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              {isDeleting ? t('deleting') : t('delete')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
