"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Filter, RotateCw, Search, Sparkles, ArrowUpRight, X, RefreshCw, Star, Zap, Clock, Play, Download, Mail, Upload, ShieldCheck, BadgeAlert, BadgeCheck, XCircle, Trash2, MailOpen, Info, Send } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/auth";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { JobProgress } from "@/components/ui/job-progress";
import { SearchJobsProgress } from "@/components/ui/search-jobs-progress";
import EmailStatus from "@/components/ui/email-status";

// Define StatusType
type StatusType = "active" | "emailed" | "replied" | "booked";

// Define Lead type
type Lead = {
    id?: string;
    _id: string;
    name: string;
    company: string;
    companyOwner?: string; // Company owner name from OpenAI lookup
    location: string;
    linkedinProfile: string;
    email: string;
    website?: string;
    status: StatusType;
    googleAds?: boolean;
    googleAdsChecked?: boolean;
    organicRanking?: number;
    tags?: string[];
    createdAt?: string;
    isHighValue: boolean;
    assignedTo?: string; // User ID who owns this lead
    leadsCreatedBy?: string; // User ID who created this lead
    rating?: string; // Google Maps business rating
    // Email automation fields
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
        trackingId?: string;
    }>;
    emailOpenStats?: {
        totalSent: number;
        totalOpened: number;
        openedStages: string[];
        lastOpenedAt: Date | null;
    };
    // Auth/Executive information from enrichment
    authInformation?: {
        company_name: string;
        company_email: string;
        owner_name: string;
        owner_email: string;
        manager_name: string;
        manager_email: string;
        hr_name: string;
        hr_email: string;
        executive_name: string;
        executive_email: string;
        // Fields stored from CSV import (no DB migration needed)
        interest_keywords?: string;
        company_linkedin?: string;
        [key: string]: string | undefined;
    };
    // Email validation fields
    emailValidationStatus?: 'notScanned' | 'valid' | 'invalid' | 'checking';
    emailValidationCheckedAt?: Date;
    emailValidationDetails?: {
        isDeliverable?: boolean;
        isFreeEmail?: boolean;
        isDisposable?: boolean;
        syntax?: boolean;
        smtpValid?: boolean;
        reason?: string;
    };
    // Contact tracking
    lastContactedAt?: Date;
    lastEmailedAt?: Date;
    // Search metadata
    source?: string;
    industry?: string;
    searchService?: string;
    searchLocation?: string;
    address?: string;
    phone?: string;
    notes?: string;
    reviews?: number;
    latitude?: number;
    longitude?: number;
    stage?: string;
    emailSequenceStartDate?: Date;
    emailStoppedReason?: string;
    emailAutomationEnabled?: boolean;
    outreachRecipient?: string;
    senderIdentity?: string;
    dealValue?: number;
    probability?: number;
    budget?: number;
    closedDate?: Date;
    closedReason?: string;
    lossReason?: string;
    lossDescription?: string;
    updatedAt?: string;
};

// Define Job type
type Job = {
    jobId: string;
    type: 'lead-collection' | 'google-ads-check';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    services: string[];
    locations: string[];
    leadQuantity: number;
    currentService: string;
    currentLocation: string;
    currentStep: number;
    totalSteps: number;
    progress: number;
    progressMessage: string;
    collectedLeads: number;
    totalLeadsCollected: number;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    estimatedDuration: number;
    timeRemaining?: number;
    queuePosition?: number;
    retryCount: number;
    maxRetries: number;
    includeGoogleAdsAnalysis?: boolean;
    analyzeLeads?: boolean;
};

// HighValueBadge removed; simple leads only

// NEW: Google Ads Status Component
// GoogleAdsStatus removed from simple leads page

const LeadsCollection = () => {
    const { t } = useTranslations();
    
    // Get current user information
    const currentUser = auth.getCurrentUser();
    
    // Form state
    const [services, setServices] = useState("");
    const [locations, setLocations] = useState("");
    const [leadQuantity, setLeadQuantity] = useState("50");
    const [customLeadQuantity, setCustomLeadQuantity] = useState("");
    
    // Loading and progress state
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState("");
    const [collectedCount, setCollectedCount] = useState(0);
    
    // Data state
    const [newLeads, setNewLeads] = useState<Lead[]>([]);           // Leads without email automation
    const [processingLeads, setProcessingLeads] = useState<Lead[]>([]);  // Leads in email automation
    const [emailedLeads, setEmailedLeads] = useState<Lead[]>([]);    // Leads completed email sequence
    const [repliedLeads, setRepliedLeads] = useState<Lead[]>([]);    // Leads who replied to our emails
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("new-leads");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCleaningEmails, setIsCleaningEmails] = useState(false);
    const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
    
    // CRM Selection state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
    const [isAddingToCRM, setIsAddingToCRM] = useState(false);
    const [isStartingEmailAutomation, setIsStartingEmailAutomation] = useState(false);
    const [isRecheckDialogOpen, setIsRecheckDialogOpen] = useState(false);
    const [isRecheckingEmails, setIsRecheckingEmails] = useState(false);
    const [isDeletingLeads, setIsDeletingLeads] = useState(false);
    const [isDeleteLeadsDialogOpen, setIsDeleteLeadsDialogOpen] = useState(false);
    const [isCleanInvalidDialogOpen, setIsCleanInvalidDialogOpen] = useState(false);
    const [isCleanDuplicatesDialogOpen, setIsCleanDuplicatesDialogOpen] = useState(false);
    
    // Job queue for reference (not used in new TemporaryLead system)
    const [jobQueue, setJobQueue] = useState<Job[]>([]);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 });
    // Test send email state
    const [testSendLead, setTestSendLead] = useState<Lead | null>(null);
    const [testSendEmail, setTestSendEmail] = useState('');
    const [testSendPreview, setTestSendPreview] = useState<{ htmlContent: string; subject: string; leadEmail: string; leadName: string; leadCompany: string; templateStage: string } | null>(null);
    const [testSendLoading, setTestSendLoading] = useState(false);
    const [testSendSending, setTestSendSending] = useState(false);
    // Direct send email state (from leads page — works for any lead)
    const [directSendLead, setDirectSendLead] = useState<Lead | null>(null);
    const [directSendStage, setDirectSendStage] = useState('');
    const [directSendRecipient, setDirectSendRecipient] = useState<'lead' | 'company'>('lead');
    const [directSendSending, setDirectSendSending] = useState(false);
    const [directSendPreview, setDirectSendPreview] = useState<{ htmlContent: string; subject: string; leadEmail: string; leadName: string; leadCompany: string; templateStage: string } | null>(null);
    const [directSendLoading, setDirectSendLoading] = useState(false);
    const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
    // Outreach configuration controls
    const [selectedRecipient, setSelectedRecipient] = useState<'lead' | 'company'>('lead');
    const [selectedSenderIdentity, setSelectedSenderIdentity] = useState<'company' | 'author'>('company');
    const [isEnrichingOwners, setIsEnrichingOwners] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    
    // Email validation progress tracking
    const [isValidationRunning, setIsValidationRunning] = useState(false);
    const [validationProgress, setValidationProgress] = useState({ checking: 0, valid: 0, invalid: 0, notScanned: 0 });
    const validationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // Google Ads analysis is now integrated into main collection process

    // Load leads from MongoDB on initial render
    useEffect(() => {
        fetchLeads();
        fetchJobQueue();
    }, []);

    const normalizeLeadId = (lead: Lead): Lead => ({
        ...lead,
        _id: lead._id || lead.id || ""
    });

    const leadCountLabel = (count: number, singularKey: string, pluralKey: string) =>
        `${count} ${count === 1 ? String(t(singularKey as any)).toLowerCase() : String(t(pluralKey as any)).toLowerCase()}`;

    // Fetch leads from the backend
    const fetchLeads = async () => {
        setIsRefreshing(true);
        try {
            // Get current user ID
            const userId = await auth.getCurrentUserId();
            
            if (!userId) {
                console.error('No user ID available for fetching leads');
                setIsRefreshing(false);
                return;
            }
            
            // Fetch leads for this specific user only
            const allResponse = await fetch(`/api/leads?userId=${userId}`);
            if (!allResponse.ok) {
                throw new Error('Failed to fetch leads');
            }
            const allData = await allResponse.json();
            const allLeads = (allData.leads || []).map(normalizeLeadId);

            // Split leads by status and email automation
            setRepliedLeads(allLeads.filter((l: Lead) => 
                // Replied leads: status is 'replied'
                l.status === 'replied'
            ));
            
            setNewLeads(allLeads.filter((l: Lead) => 
                // New leads: no email automation started yet and not replied
                l.status !== 'replied' &&
                !l.emailSequenceActive && (!l.emailHistory || l.emailHistory.length === 0)
            ));
            
            setProcessingLeads(allLeads.filter((l: Lead) => 
                // Processing: email automation is active and sequence not completed and not replied
                l.status !== 'replied' &&
                l.emailSequenceActive && 
                (!l.emailSequenceStage || l.emailSequenceStage !== 'called_seven_times')
            ));
            
            setEmailedLeads(allLeads.filter((l: Lead) => 
                // Emailed: email sequence completed (reached stage 7) or automation inactive with email history and not replied
                l.status !== 'replied' &&
                ((!l.emailSequenceActive && l.emailHistory && l.emailHistory.length > 0) ||
                (l.emailSequenceStage === 'called_seven_times'))
            ));
        } catch (error) {
            console.error('Error fetching leads:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const openDeleteLeadsDialog = () => {
        if (selectedLeads.size === 0) {
            showUniqueToast('No leads selected', 'error');
            return;
        }

        setIsDeleteLeadsDialogOpen(true);
    };

    const cleanInvalidEmails = async () => {
        setIsCleanInvalidDialogOpen(false);

        let loadingToastId: string | number | undefined;

        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error('Please log in to clean invalid emails');
                return;
            }

            setIsCleaningEmails(true);
            loadingToastId = toast.loading('Validating and removing invalid emails...');

            const response = await fetch('/api/leads/cleanup-invalid-emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${userId}`
                }
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to clean invalid emails');
            }

            if (data.cronjobStarted) {
                toast.success(
                    `Email cleanup started for ${data.totalEmails || 0} emails in ${data.totalBatches || 0} batches.`,
                    { duration: 6000 }
                );
            } else {
                const deleted = Number(data.deleted || 0);
                toast.success(
                    `Invalid email cleanup complete. Deleted ${deleted} lead(s).`,
                    { duration: 6000 }
                );
            }

            await fetchLeads();
        } catch (error: any) {
            console.error('Clean invalid emails error:', error);
            toast.error(`Failed to clean invalid emails: ${error.message || 'Unknown error'}`);
        } finally {
            if (loadingToastId !== undefined) {
                toast.dismiss(loadingToastId);
            }
            setIsCleaningEmails(false);
        }
    };

    const cleanDuplicateEmails = async () => {
        setIsCleanDuplicatesDialogOpen(false);

        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error('Please log in to clean duplicates');
                return;
            }

            setIsCleaningDuplicates(true);
            toast.loading('Searching for duplicate emails...', { duration: 3000 });

            const response = await fetch('/api/leads/clean-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to clean duplicates');
            }

            if (data.duplicates === 0) {
                toast.success('✅ No duplicate emails found!\n\nAll leads have unique email addresses.');
            } else {
                toast.success(
                    `🗑️ Duplicates cleaned!\n\n` +
                    `• Found: ${data.duplicates} duplicate email(s)\n` +
                    `• Deleted: ${data.deleted} duplicate lead(s)\n` +
                    `• Kept: Oldest lead for each email\n\n` +
                    `Your database is now clean!`,
                    { duration: 8000 }
                );
            }

            setTimeout(() => fetchLeads(), 2000);
        } catch (error: any) {
            console.error('Clean duplicates error:', error);
            toast.error(`Failed to clean duplicates: ${error.message}`);
        } finally {
            setIsCleaningDuplicates(false);
        }
    };

    // Check email validation progress
    const checkValidationProgress = async () => {
        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) return;

            const response = await fetch(`/api/leads?userId=${userId}`);
            if (!response.ok) return;
            
            const data = await response.json();
            const allLeads = data.leads || [];

            // Count validation statuses
            const checking = allLeads.filter((l: Lead) => l.emailValidationStatus === 'checking').length;
            const valid = allLeads.filter((l: Lead) => l.emailValidationStatus === 'valid').length;
            const invalid = allLeads.filter((l: Lead) => l.emailValidationStatus === 'invalid').length;
            const notScanned = allLeads.filter((l: Lead) => 
                !l.emailValidationStatus || l.emailValidationStatus === 'notScanned'
            ).length;

            setValidationProgress({ checking, valid, invalid, notScanned });

            // If no leads are being checked and none are waiting, stop auto-refresh
            if (checking === 0 && notScanned === 0) {
                stopValidationTracking();
            }

            // Update leads to show new statuses
            fetchLeads();
        } catch (error) {
            console.error('Error checking validation progress:', error);
        }
    };

    // Start validation progress tracking
    const startValidationTracking = () => {
        setIsValidationRunning(true);
        
        // Clear any existing interval
        if (validationIntervalRef.current) {
            clearInterval(validationIntervalRef.current);
        }

        // Check progress every 5 seconds
        validationIntervalRef.current = setInterval(() => {
            checkValidationProgress();
        }, 5000);

        // Initial check
        checkValidationProgress();
    };

    // Stop validation progress tracking
    const stopValidationTracking = () => {
        setIsValidationRunning(false);
        
        if (validationIntervalRef.current) {
            clearInterval(validationIntervalRef.current);
            validationIntervalRef.current = null;
        }
    };

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (validationIntervalRef.current) {
                clearInterval(validationIntervalRef.current);
            }
        };
    }, []);

    // NEW: Fetch job queue
    const fetchJobQueue = async () => {
        try {
            // Get current user ID
            const userId = await auth.getCurrentUserId();
            
            if (!userId) {
                console.error('No user ID available for fetching job queue');
                return;
            }
            
            const response = await fetch(`/api/jobs/queue?userId=${userId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setJobQueue(data.jobs || []);
                    
                    // NEW: Auto-start local processing for pending jobs in development
                    if (process.env.NODE_ENV === 'development') {
                        const pendingJobs = data.jobs?.filter((job: Job) => job.status === 'pending') || [];
                        for (const job of pendingJobs) {
                            console.log(`🔄 Auto-starting local job ${job.jobId} in development mode`);
                            startLocalJob(job.jobId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching job queue:', error);
        }
    };

    // NEW: Start local job processing for development
    const startLocalJob = async (jobId: string) => {
        try {
            const response = await fetch('/api/jobs/process-local', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Local job processing error:', errorData);
            } else {
                const data = await response.json();
                console.log('Local job started:', data);
            }
        } catch (error) {
            console.error('Error starting local job:', error);
        }
    };

    // Validate required credentials before starting lead collection.
    // Order is intentional: SERPAPI (Google Maps discovery) -> Gemini (enrichment) -> OpenAI -> SMTP -> IMAP.
    const checkCollectionCredentials = async (): Promise<{ ok: boolean; missing: string[]; group?: string; error?: string }> => {
        try {
            const authHeader = auth.getAuthHeader();
            const response = await fetch('/api/credentials', {
                headers: authHeader ? { Authorization: authHeader } : undefined,
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                const errorMsg = data?.error || 'Failed to verify credentials';
                return { ok: false, missing: [], error: errorMsg };
            }

            const rawCreds = (data.credentials || {}) as Record<string, any>;

            const resolveFirstApiKey = (singleKeyName: string, accountListName: string) => {
                const single = String(rawCreds[singleKeyName] || '').trim();
                if (single) return single;

                const accountList = rawCreds[accountListName];
                if (!Array.isArray(accountList)) return '';

                for (const account of accountList) {
                    if (typeof account === 'string' && account.trim()) return account.trim();
                    if (typeof account?.apiKey === 'string' && account.apiKey.trim()) return account.apiKey.trim();
                    if (typeof account?.key === 'string' && account.key.trim()) return account.key.trim();
                    if (typeof account?.value === 'string' && account.value.trim()) return account.value.trim();
                    if (typeof account?.SERPAPI_KEY === 'string' && account.SERPAPI_KEY.trim()) return account.SERPAPI_KEY.trim();
                    if (typeof account?.OPENAI_API_KEY === 'string' && account.OPENAI_API_KEY.trim()) return account.OPENAI_API_KEY.trim();
                    if (typeof account?.GEMINI_API_KEY === 'string' && account.GEMINI_API_KEY.trim()) return account.GEMINI_API_KEY.trim();
                }
                return '';
            };

            const resolveFirstSmtpAccount = () => {
                const smtpAccounts = rawCreds.SMTP_ACCOUNTS;
                if (!Array.isArray(smtpAccounts)) return null;

                for (const account of smtpAccounts) {
                    const host = String(account?.SMTP_HOST ?? account?.host ?? '').trim();
                    const port = String(account?.SMTP_PORT ?? account?.port ?? '').trim();
                    const user = String(account?.SMTP_USER ?? account?.user ?? '').trim();
                    const password = String(account?.SMTP_PASSWORD ?? account?.password ?? '').trim();

                    if (host || port || user || password) {
                        return { host, port, user, password };
                    }
                }

                return null;
            };

            const firstSmtp = resolveFirstSmtpAccount();
            const creds = {
                ...rawCreds,
                SERPAPI_KEY: resolveFirstApiKey('SERPAPI_KEY', 'SERPAPI_ACCOUNTS'),
                GEMINI_API_KEY: resolveFirstApiKey('GEMINI_API_KEY', 'GEMINI_ACCOUNTS'),
                OPENAI_API_KEY: resolveFirstApiKey('OPENAI_API_KEY', 'OPENAI_ACCOUNTS'),
                SMTP_HOST: String(rawCreds.SMTP_HOST || firstSmtp?.host || '').trim(),
                SMTP_PORT: String(rawCreds.SMTP_PORT || firstSmtp?.port || '').trim(),
                SMTP_USER: String(rawCreds.SMTP_USER || firstSmtp?.user || '').trim(),
                SMTP_PASSWORD: String(rawCreds.SMTP_PASSWORD || firstSmtp?.password || '').trim(),
            } as Record<string, string>;

            const checks = [
                { group: 'SERPAPI', keys: ['SERPAPI_KEY'] },
                { group: 'Gemini', keys: ['GEMINI_API_KEY'] },
                { group: 'OpenAI', keys: ['OPENAI_API_KEY'] },
                { group: 'SMTP', keys: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] },
                { group: 'IMAP', keys: ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASSWORD'] },
            ];

            for (const check of checks) {
                const missing = check.keys.filter((key) => {
                    const value = creds[key];
                    return !value || String(value).trim() === '';
                });

                if (missing.length > 0) {
                    return { ok: false, missing, group: check.group };
                }
            }

            return { ok: true, missing: [] };
        } catch (error: any) {
            return { ok: false, missing: [], error: error?.message || 'Credential check failed' };
        }
    };

    // NEW: Handle starting background job collection
    const handleStartCollection = async () => {
        if (!services || !locations) {
            toast.error("Please enter both services and locations.");
            return;
        }

        // Validate custom quantity if selected
        if (leadQuantity === "custom") {
            if (!customLeadQuantity || parseInt(customLeadQuantity) < 1) {
                toast.error("Please enter a valid custom number of leads (minimum 1).");
                return;
            }
            if (parseInt(customLeadQuantity) > 10000) {
                toast.error("Maximum custom quantity is 10,000 leads.");
                return;
            }
        }

        // Get current user ID first.
        const userId = await auth.getCurrentUserId();
        if (!userId) {
            toast.error("User authentication required. Please login again.");
            return;
        }

        // Hard stop if required credentials are missing.
        const credentialCheck = await checkCollectionCredentials();
        if (!credentialCheck.ok) {
            if (credentialCheck.error) {
                console.error('Credential pre-check failed:', credentialCheck.error);
                toast.error(`Cannot start process: ${credentialCheck.error}`);
                return;
            }

            const missingList = credentialCheck.missing.join(', ');
            const groupLabel = credentialCheck.group || 'required';
            console.error(`Credential pre-check failed at ${groupLabel}. Missing: ${missingList}`);
            toast.error(`Process stopped. Missing ${groupLabel} credential(s): ${missingList}. Please add them in Account Settings > Credentials.`);
            return;
        }

        setIsLoading(true);
        setProgress(0);
        setCollectedCount(0);
        
        try {
            // Determine the actual quantity to use
            const actualQuantity = leadQuantity === "custom" ? customLeadQuantity : leadQuantity;
            
            // Always use new TemporaryLead system
            const apiEndpoint = '/api/temporary-leads/search';
            const analysisType = 'SerpAPI Google Maps → TemporaryLead → Gemini Google Search enrichment';
            
            setProgressMessage(`Queuing job for background processing with ${analysisType}...`);

            // Queue the job for background processing
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    services,
                    locations,
                    userId: userId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const apiError = errorData.error || 'Failed to queue job';
                const missing = Array.isArray(errorData.missingCredentials) ? errorData.missingCredentials.join(', ') : '';
                throw new Error(missing ? `${apiError}. Missing: ${missing}` : apiError);
            }

            const data = await response.json();
            
            if (data.success) {
                toast.success(`🚀 ${data.message || 'Search jobs created successfully!'}`);
                console.log(`✅ Created ${data.jobsCreated} search jobs (${data.totalCombinations} combinations)`);
                console.log(`⏱️ Estimated completion time: ${data.estimatedTime}`);
                
                // Reset form
                setServices("");
                setLocations("");
                setLeadQuantity("50");
                setCustomLeadQuantity("");
                
                // Refresh leads list after a short delay to show new data
                setTimeout(() => {
                    fetchLeads();
                    toast.info("💡 Tip: Search jobs process every 5 minutes, auth checks every minute. Check back soon!");
                }, 2000);
            } else {
                throw new Error(data.error || 'Failed to create search jobs');
            }
        } catch (error: any) {
            console.error('Job queuing error:', error);
            toast.error(error.message || "Failed to queue job. Please try again.");
        } finally {
            setIsLoading(false);
            setProgress(0);
            setProgressMessage("");
        }
    };

    // Note: Job progress tracking removed - new TemporaryLead system uses background cron jobs

    // Removed high-value validation; only simple leads collection remains

    // Filter leads based on search term
    const getFilteredLeads = () => {
        let leadsToFilter;
        if (activeTab === "new-leads") {
            leadsToFilter = newLeads;
        } else if (activeTab === "processing-leads") {
            leadsToFilter = processingLeads;
        } else if (activeTab === "emailed-leads") {
            leadsToFilter = emailedLeads;
        } else if (activeTab === "replied-leads") {
            leadsToFilter = repliedLeads;
        } else {
            leadsToFilter = activeTab === "new-leads" ? newLeads : processingLeads;
        }
        if (!searchTerm) return leadsToFilter;
        return leadsToFilter.filter(lead =>
            lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (lead.companyOwner && lead.companyOwner.toLowerCase().includes(searchTerm.toLowerCase())) ||
            lead.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lead.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    };

    const filteredLeads = getFilteredLeads();
    const isRepliesTab = activeTab === 'replied-leads';

    // For the dashboard
    const allLeads = [...newLeads, ...processingLeads, ...emailedLeads, ...repliedLeads];

    // Google Ads analysis is now integrated into the main collection process

    // NEW: Get active jobs count
    const activeJobsCount = jobQueue.filter(job => 
        job.status === 'pending' || job.status === 'running'
    ).length;

    // Global toast deduplication system
    const lastToastRef = useRef<{message: string, time: number}>({message: '', time: 0});
    
    const showUniqueToast = (message: string, type: 'success' | 'error' = 'success') => {
        const now = Date.now();
        const timeDiff = now - lastToastRef.current.time;
        
        // Prevent duplicate toasts within 1 second
        if (lastToastRef.current.message === message && timeDiff < 1000) {
            return; // Block duplicate
        }
        
        lastToastRef.current = {message, time: now};
        
        if (type === 'success') {
            toast.success(message);
        } else {
            toast.error(message);
        }
    };
    
    // Resolve the display name + role for a lead.
    // Priority: authInformation.owner_name -> authInformation.executive_name
    //           -> companyOwner -> lead.name -> "not found"
    // Role priority: authInformation.role (from CSV) -> owner/executive label -> '-'
    const getLeadDisplayName = (lead: Lead): { name: string; role: string; isNotFound: boolean } => {
        const csvRole = lead.authInformation?.role?.trim();

        const ownerName = lead.authInformation?.owner_name?.trim();
        if (ownerName) return { name: ownerName, role: csvRole || 'Owner', isNotFound: false };

        const executiveName = lead.authInformation?.executive_name?.trim();
        if (executiveName) return { name: executiveName, role: csvRole || 'Executive', isNotFound: false };

        const companyOwnerName = lead.companyOwner?.trim();
        if (companyOwnerName) return { name: companyOwnerName, role: csvRole || 'Owner', isNotFound: false };

        const leadName = lead.name?.trim();
        if (leadName) return { name: leadName, role: csvRole || '-', isNotFound: false };

        return { name: String(t("notFound")), role: csvRole || '-', isNotFound: true };
    };

    const copyEmailToClipboard = async (event: React.MouseEvent, email: string) => {
        // Prevent event bubbling
        event.preventDefault();
        event.stopPropagation();
        
        try {
            await navigator.clipboard.writeText(email);
            showUniqueToast(`📧 Email copied: ${email}`);
        } catch (error) {
            // Fallback for older browsers
            try {
                const textArea = document.createElement('textarea');
                textArea.value = email;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (successful) {
                    showUniqueToast(`📧 Email copied: ${email}`);
                } else {
                    showUniqueToast('Failed to copy email to clipboard', 'error');
                }
            } catch (fallbackError) {
                showUniqueToast('Failed to copy email to clipboard', 'error');
            }
        }
    };

    // Show Auth Information dialog for a lead
    const [authInfoLead, setAuthInfoLead] = useState<Lead | null>(null);
    // Show Lead Details dialog for a lead
    const [detailsLead, setDetailsLead] = useState<Lead | null>(null);

    // CRM Selection functions
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedLeads(new Set());
    };

    const toggleLeadSelection = (leadId?: string) => {
        if (!leadId) return;
        const newSelected = new Set(selectedLeads);
        if (newSelected.has(leadId)) {
            newSelected.delete(leadId);
        } else {
            newSelected.add(leadId);
        }
        setSelectedLeads(newSelected);
    };

    const toggleSelectAll = () => {
        const currentLeads = filteredLeads;
        const currentLeadIds = currentLeads
            .map(lead => lead._id)
            .filter((id): id is string => Boolean(id));
        if (selectedLeads.size === currentLeadIds.length && currentLeadIds.every(leadId => selectedLeads.has(leadId))) {
            setSelectedLeads(new Set());
        } else {
            setSelectedLeads(new Set(currentLeadIds));
        }
    };

    const addSelectedToCRM = async () => {
        if (selectedLeads.size === 0) {
            showUniqueToast('Please select at least one lead', 'error');
            return;
        }

        setIsAddingToCRM(true);

        try {
            // Get leads from new leads tab (only new leads can start automation)
            const leadsToAdd = newLeads.filter(lead => selectedLeads.has(lead._id));
            
            let successCount = 0;
            let errorCount = 0;
            
            // Process each lead individually
            for (const lead of leadsToAdd) {
                try {
                    // Update lead status to "emailed" via CRM API
                    const response = await fetch('/api/crm/leads', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            leadId: lead._id,
                            stage: 'called_once', // This automatically starts email automation
                            notes: `Added to email queue via lead selection on ${new Date().toLocaleDateString()}`
                        }),
                    });

                    const result = await response.json();
                    
                    if (result.success) {
                        // Email automation will be handled by the cron job - no need to send manually
                        successCount++;
                        console.log(`✅ Successfully added ${lead.name} to email automation queue`);
                    } else {
                        errorCount++;
                        console.error(`❌ Failed to add ${lead.name}: ${result.error}`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Error adding ${lead.name}:`, error);
                }
                
                // Small delay between API calls
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (successCount > 0 && errorCount === 0) {
                showUniqueToast(`✅ Successfully added ${successCount} leads to email automation queue! Emails will be sent by the automation system.`);
            } else if (successCount > 0 && errorCount > 0) {
                showUniqueToast(`⚠️ Added ${successCount} leads to automation queue, ${errorCount} failed`);
            } else {
                showUniqueToast('❌ Failed to add leads to automation queue', 'error');
            }
            
            // Refresh leads data to show updated statuses
            await fetchLeads();
            
            // Reset selection
            setSelectedLeads(new Set());
            setIsSelectionMode(false);
            
        } catch (error) {
            console.error('Error adding leads to email queue:', error);
            showUniqueToast('Failed to add leads to email queue', 'error');
        } finally {
            setIsAddingToCRM(false);
        }
    };

    // Start Email Automation function
    const startEmailAutomation = async () => {
        if (selectedLeads.size === 0) {
            showUniqueToast('Please select at least one lead', 'error');
            return;
        }

        // CRITICAL: Check email validation status for all selected leads
        const leadIds = Array.from(selectedLeads);
        const selectedLeadsData = filteredLeads.filter(lead => leadIds.includes(lead._id));
        
        // Check validation status
        const notValidated = selectedLeadsData.filter(lead => 
            !lead.emailValidationStatus || 
            lead.emailValidationStatus === 'notScanned' || 
            lead.emailValidationStatus === 'checking'
        );
        
        const invalidEmails = selectedLeadsData.filter(lead => 
            lead.emailValidationStatus === 'invalid'
        );

        const validEmails = selectedLeadsData.filter(lead => 
            lead.emailValidationStatus === 'valid'
        );

        // If ANY leads are not validated or invalid, block automation
        if (notValidated.length > 0 || invalidEmails.length > 0) {
            const totalSelected = selectedLeadsData.length;
            const notValidatedCount = notValidated.length;
            const invalidCount = invalidEmails.length;
            const validCount = validEmails.length;
            
            let errorMessage = `❌ Cannot start email automation!\n\n`;
            errorMessage += `📊 Validation Status:\n`;
            errorMessage += `✅ Valid: ${validCount}/${totalSelected}\n`;
            
            if (notValidatedCount > 0) {
                errorMessage += `⚠️ Not Validated: ${notValidatedCount}\n`;
            }
            if (invalidCount > 0) {
                errorMessage += `❌ Invalid Emails: ${invalidCount}\n`;
            }
            
            errorMessage += `\n💡 Solution:\n`;
            errorMessage += `1. Click "Email Validation" button\n`;
            errorMessage += `2. Wait for validation to complete\n`;
            errorMessage += `3. Remove invalid emails from selection\n`;
            errorMessage += `4. Try again with validated emails only`;
            
            toast.error(errorMessage, { duration: 10000 });
            return;
        }

        // All emails are validated - proceed with automation
        setIsStartingEmailAutomation(true);

        try {
            // Determine outreach config from UI selections if present
            const outreachRecipient = selectedRecipient || undefined; // 'lead' | 'company'
            const senderIdentity = selectedSenderIdentity || undefined; // 'company' | 'author'
            
            const userId = await auth.getCurrentUserId();
            const response = await fetch('/api/start-email-automation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ leadIds, userId, outreachRecipient, senderIdentity }),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                const summary = result.summary || {};
                const started = Number(summary.started || 0);
                const skipped = Number(summary.skipped || 0);
                const errors = Number(summary.errors || 0);
                showUniqueToast(
                    `✅ Email automation queued: ${started} started${skipped > 0 ? `, ${skipped} already active` : ''}${errors > 0 ? `, ${errors} failed to start` : ''}`
                );
                toast.info('📬 Track each lead in the Email Automation column: Sent, Sending, Failed, or Undeliverable.');
                
                // Log detailed results for debugging
                console.log('📧 Email automation results:', result.results);
                
                // Refresh leads data to show updated statuses
                await fetchLeads();
                
                // Reset selection
                setSelectedLeads(new Set());
                setIsSelectionMode(false);
            } else {
                // Surface missing credentials clearly
                const msg = result?.error || 'Failed to start email automation';
                showUniqueToast(`❌ ${msg}`, 'error');
            }
            
        } catch (error) {
            console.error('Error starting email automation:', error);
            showUniqueToast('Failed to start email automation', 'error');
        } finally {
            setIsStartingEmailAutomation(false);
        }
    };

    const openRecheckDialog = () => {
        if (selectedLeads.size === 0) {
            toast.error('Select at least one lead to re-check emails');
            return;
        }
        setIsRecheckDialogOpen(true);
    };

    const handleRecheckEmails = async () => {
        const selectedLeadIds = Array.from(selectedLeads);
        if (selectedLeadIds.length === 0) {
            setIsRecheckDialogOpen(false);
            toast.error('Select at least one lead to re-check emails');
            return;
        }

        setIsRecheckingEmails(true);
        setIsRecheckDialogOpen(false);

        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error('Please log in to validate emails');
                return;
            }

            toast.loading('Starting selected email re-check...', { duration: 3000 });

            const response = await fetch('/api/email-validation/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, leadIds: selectedLeadIds })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start validation');
            }

            if (data.leadsToValidate === 0) {
                toast.success('No selected active leads needed re-check.');
            } else {
                const totalBatches = Math.ceil(data.leadsToValidate / 20);
                const lastBatchSize = data.leadsToValidate % 20 || 20;

                toast.success(
                    `Email re-check started for selected leads.\n\n` +
                    `Total: ${data.leadsToValidate} leads\n` +
                    `Batches: ${totalBatches} (${totalBatches - 1} x 20 + ${lastBatchSize})\n` +
                    `Every 3 minutes\n` +
                    `Real-time progress tracking enabled`,
                    { duration: 10000 }
                );

                startValidationTracking();
            }

            setTimeout(() => fetchLeads(), 2000);
        } catch (error: any) {
            console.error('Email validation error:', error);
            toast.error(`Failed to start validation: ${error.message}`);
        } finally {
            setIsRecheckingEmails(false);
        }
    };

    // Export functions
    const exportLeads = async (format: 'csv' | 'pdf' | 'json') => {
        try {
            const allLeads = [...newLeads, ...processingLeads, ...emailedLeads, ...repliedLeads]
                .filter((lead) => (lead._id || lead.id))
                .reduce((acc: Lead[], lead) => {
                    const leadId = lead._id || lead.id;
                    if (!leadId || acc.some((item) => (item._id || item.id) === leadId)) {
                        return acc;
                    }
                    acc.push(lead);
                    return acc;
                }, []);

            if (allLeads.length === 0) {
                toast.error("No leads to export");
                return;
            }

            // CSV export
            if (format === 'csv') {
                const csvEscape = (value: unknown) => {
                    const text = value === null || value === undefined ? '' : String(value);
                    return `"${text.replace(/"/g, '""')}"`;
                };

                const headers = [
                    'id',
                    'name',
                    'company',
                    'companyOwner',
                    'email',
                    'phone',
                    'location',
                    'website',
                    'linkedinProfile',
                    'status',
                    'stage',
                    'source',
                    'industry',
                    'googleAds',
                    'googleAdsChecked',
                    'organicRanking',
                    'isHighValue',
                    'rating',
                    'reviews',
                    'notes',
                    'address',
                    'latitude',
                    'longitude',
                    'emailValidationStatus',
                    'emailValidationCheckedAt',
                    'emailValidationDetails',
                    'emailAutomationEnabled',
                    'emailSequenceActive',
                    'emailSequenceStage',
                    'emailSequenceStep',
                    'emailSequenceStartDate',
                    'nextScheduledEmail',
                    'emailStatus',
                    'emailRetryCount',
                    'emailFailureCount',
                    'emailLastAttempt',
                    'emailErrors',
                    'emailHistory',
                    'outreachRecipient',
                    'senderIdentity',
                    'authInformation',
                    'tags',
                    'createdAt',
                    'assignedTo',
                    'leadsCreatedBy',
                ];

                const csvRows = allLeads.map(lead => [
                    lead._id || lead.id || '',
                    lead.name || '',
                    lead.company || '',
                    lead.companyOwner || '',
                    lead.email || '',
                    (lead as any).phone || '',
                    lead.location || '',
                    lead.website || '',
                    lead.linkedinProfile || '',
                    lead.status || '',
                    (lead as any).stage || '',
                    (lead as any).source || '',
                    (lead as any).industry || '',
                    String(Boolean(lead.googleAds)),
                    String(Boolean((lead as any).googleAdsChecked)),
                    (lead.organicRanking ?? '') as any,
                    String(Boolean(lead.isHighValue)),
                    (lead as any).rating ?? '',
                    (lead as any).reviews ?? '',
                    (lead as any).notes || '',
                    (lead as any).address || '',
                    (lead as any).latitude ?? '',
                    (lead as any).longitude ?? '',
                    lead.emailValidationStatus || '',
                    lead.emailValidationCheckedAt ? new Date(lead.emailValidationCheckedAt).toISOString() : '',
                    lead.emailValidationDetails ? JSON.stringify(lead.emailValidationDetails) : '',
                    String((lead as any).emailAutomationEnabled ?? ''),
                    String(Boolean(lead.emailSequenceActive)),
                    lead.emailSequenceStage || '',
                    lead.emailSequenceStep ?? '',
                    (lead as any).emailSequenceStartDate ? new Date((lead as any).emailSequenceStartDate).toISOString() : '',
                    lead.nextScheduledEmail ? new Date(lead.nextScheduledEmail).toISOString() : '',
                    lead.emailStatus || '',
                    lead.emailRetryCount ?? '',
                    lead.emailFailureCount ?? '',
                    lead.emailLastAttempt ? new Date(lead.emailLastAttempt).toISOString() : '',
                    lead.emailErrors ? JSON.stringify(lead.emailErrors) : '',
                    lead.emailHistory ? JSON.stringify(lead.emailHistory) : '',
                    (lead as any).outreachRecipient || '',
                    (lead as any).senderIdentity || '',
                    lead.authInformation ? JSON.stringify(lead.authInformation) : '',
                    lead.tags ? JSON.stringify(lead.tags) : '',
                    lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
                    lead.assignedTo || '',
                    lead.leadsCreatedBy || '',
                ]);

                const content = [headers, ...csvRows]
                    .map(row => row.map(field => csvEscape(field)).join(','))
                    .join('\n');
                const filename = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
                const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });

                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success(`Exported ${allLeads.length} leads to CSV file`);
                return;
            }

            // JSON export
            if (format === 'json') {
                const content = JSON.stringify(allLeads, null, 2);
                const filename = `leads-export-${new Date().toISOString().split('T')[0]}.json`;
                const blob = new Blob([content], { type: 'application/json' });

                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success(`Exported ${allLeads.length} leads to JSON file`);
                return;
            }

            // PDF export (real PDF)
            if (format === 'pdf') {
                const { jsPDF } = await import('jspdf');
                const doc = new jsPDF({ unit: 'pt', format: 'a4' });

                const margin = 40;
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const contentWidth = pageWidth - margin * 2;
                const lineHeight = 16;

                // Title
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.text('Leads Export', margin, margin);

                // Subtitle (date)
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 14);

                let y = margin + 32;

                // Column labels
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                const columns = [
                    { key: 'name', label: 'Name', width: Math.floor(contentWidth * 0.16) },
                    { key: 'company', label: 'Company', width: Math.floor(contentWidth * 0.18) },
                    { key: 'companyOwner', label: 'Owner', width: Math.floor(contentWidth * 0.16) },
                    { key: 'email', label: 'Email', width: Math.floor(contentWidth * 0.24) },
                    { key: 'location', label: 'Location', width: Math.floor(contentWidth * 0.14) },
                    { key: 'status', label: 'Status', width: Math.floor(contentWidth * 0.12) },
                ];

                let x = margin;
                columns.forEach(col => {
                    doc.text(col.label, x, y);
                    x += col.width;
                });

                // Separator line
                y += 6;
                doc.setLineWidth(0.5);
                doc.line(margin, y, pageWidth - margin, y);
                y += 10;

                // Rows
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);

                for (const lead of allLeads) {
                    // Compute wrapped lines per column
                    const values = [
                        String(lead.name || ''),
                        String(lead.company || ''),
                        String(lead.companyOwner || ''),
                        String(lead.email || ''),
                        String(lead.location || ''),
                        String(lead.status || ''),
                    ];

                    const wrappedPerCol = values.map((val, idx) => {
                        return doc.splitTextToSize(val, columns[idx].width - 6);
                    });

                    const rowHeight = Math.max(
                        ...wrappedPerCol.map(lines => Math.max(lines.length, 1) * lineHeight)
                    );

                    // Add new page if needed
                    if (y + rowHeight > pageHeight - margin) {
                        doc.addPage();
                        y = margin;

                        // redraw header on new page
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(11);
                        let hx = margin;
                        columns.forEach(col => {
                            doc.text(col.label, hx, y);
                            hx += col.width;
                        });
                        y += 6;
                        doc.setLineWidth(0.5);
                        doc.line(margin, y, pageWidth - margin, y);
                        y += 10;
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                    }

                    // Draw cell texts
                    let cx = margin;
                    wrappedPerCol.forEach((lines: string[], idx: number) => {
                        let lineY = y;
                        lines.forEach((line: string) => {
                            doc.text(line, cx + 2, lineY);
                            lineY += lineHeight;
                        });
                        cx += columns[idx].width;
                    });

                    y += rowHeight + 6;
                }

                const filename = `leads-export-${new Date().toISOString().split('T')[0]}.pdf`;
                doc.save(filename);

                toast.success(`Exported ${allLeads.length} leads to PDF file`);
                return;
            }
        } catch (error) {
            console.error('Error exporting leads:', error);
            toast.error(`Failed to export leads to ${format.toUpperCase()}`);
        }
    };

    // Import function
    const importLeads = async (files: File | File[]) => {
      try {
        const fileArr = Array.isArray(files) ? files : [files];
        if (fileArr.length === 0) {
            toast.error("No files selected");
            return;
        }

        const userId = await auth.getCurrentUserId();
        if (!userId) {
            toast.error("You must be signed in to import leads");
            return;
        }

        setIsImporting(true);
        setImportProgress({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 });

        // Validate file types - accept both JSON and CSV
        const validFiles = fileArr.filter(f => {
            const name = f.name.toLowerCase();
            return name.endsWith('.json') || name.endsWith('.csv');
        });

        if (validFiles.length === 0) {
            toast.error("Only JSON and CSV files are accepted for import");
            return;
        }

        // Parse a single CSV file into an array of lead objects.
        // Handles quoted fields with commas and embedded quotes.
        const parseCsv = (text: string): any[] => {
            // Strip BOM if present
            const clean = text.replace(/^\uFEFF/, '');
            const rows: string[][] = [];
            let cur: string[] = [];
            let field = '';
            let inQuotes = false;

            for (let i = 0; i < clean.length; i++) {
                const ch = clean[i];
                if (inQuotes) {
                    if (ch === '"') {
                        if (clean[i + 1] === '"') {
                            field += '"';
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        field += ch;
                    }
                } else {
                    if (ch === '"') {
                        inQuotes = true;
                    } else if (ch === ',') {
                        cur.push(field);
                        field = '';
                    } else if (ch === '\r') {
                        // ignore - handle \r\n or \r
                        continue;
                    } else if (ch === '\n') {
                        cur.push(field);
                        rows.push(cur);
                        cur = [];
                        field = '';
                    } else {
                        field += ch;
                    }
                }
            }
            // push trailing field/row if any
            if (field.length > 0 || cur.length > 0) {
                cur.push(field);
                rows.push(cur);
            }

            if (rows.length === 0) return [];
            const headers = rows[0].map(h => h.trim());
            const out: any[] = [];
            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!row || row.every(c => c.trim() === '')) continue;
                const obj: any = {};
                for (let c = 0; c < headers.length; c++) {
                    obj[headers[c]] = (row[c] ?? '').trim();
                }
                out.push(obj);
            }
            return out;
        };

        // Map a CSV row (with merged CSV headers) to the lead shape expected by the API.
        const mapCsvRow = (row: any) => {
            const trim = (v: any) => String(v ?? '').trim();

            // Build notes from extra columns that don't have dedicated fields
            const noteLines: string[] = [];
            const personalEmail = trim(row.personal_email);
            const primaryEmail = trim(row.email);
            if (personalEmail && personalEmail !== primaryEmail) {
                noteLines.push(`Personal email: ${personalEmail}`);
            }
            const seniority = trim(row.seniority);
            if (seniority) noteLines.push(`Seniority: ${seniority}`);

            // Role is a job title (e.g. "Owner", "Founder & Director"), NOT a person's name.
            // Put it in notes and authInformation — do NOT map it to companyOwner (which expects a name).
            const role = trim(row.role);
            if (role) noteLines.push(`Role: ${role}`);

            // found_in looks like "category | location" - split into searchService / searchLocation
            const foundIn = trim(row.found_in);
            let searchService = '';
            let searchLocation = '';
            if (foundIn) {
                const parts = foundIn.split('|').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    searchService = parts[0];
                    searchLocation = parts[parts.length - 1];
                } else if (parts.length === 1) {
                    searchService = parts[0];
                }
            }

            // Store the new fields inside authInformation JSON so no DB migration is required
            const interestKeywords = trim(row.interest_keywords) || trim(row.interestKeywords);
            const companyLinkedin = trim(row.company_linkedin) || trim(row.companyLinkedin);
            const authInformation: any = {};
            if (interestKeywords) authInformation.interest_keywords = interestKeywords;
            if (companyLinkedin) authInformation.company_linkedin = companyLinkedin;
            if (role) authInformation.role = role;

            // Company name: use the CSV value. If empty, try to extract from the email domain.
            // Do NOT fall back to industry/category — that's a category, not a company name.
            let company = trim(row.company);
            if (!company && primaryEmail) {
                // Extract domain from email and capitalize it (e.g. "wbhandel.nl" -> "Wbhandel")
                const domain = primaryEmail.split('@')[1] || '';
                const baseDomain = domain.split('.')[0] || '';
                if (baseDomain) {
                    company = baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1);
                }
            }
            // Try to extract from company LinkedIn URL as a last resort
            if (!company && companyLinkedin) {
                const match = companyLinkedin.match(/linkedin\.com\/company\/([^/?]+)/);
                if (match) {
                    company = match[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                }
            }
            if (!company) company = 'Unknown Company';

            return {
                name: trim(row.name),
                company: company,
                location: trim(row.country) || trim(row.location),
                email: primaryEmail,
                phone: trim(row.phone_number) || trim(row.phone),
                linkedinProfile: trim(row.linkedin) || trim(row.linkedinProfile),
                authInformation: Object.keys(authInformation).length > 0 ? authInformation : null,
                address: trim(row.company_address) || trim(row.address),
                industry: trim(row.category) || trim(row.industry),
                searchService: searchService || trim(row.searchService),
                searchLocation: searchLocation || trim(row.searchLocation),
                status: 'active',
                stage: 'new_leads',
                tags: [] as string[],
                source: 'import',
                notes: noteLines.length > 0 ? noteLines.join('\n') : '',
            };
        };

        // Map a parsed JSON lead object (existing format) to the API shape
        const mapJsonLead = (lead: any) => {
            // If a JSON lead has top-level companyLinkedin/interestKeywords (e.g. from an older export),
            // fold them into authInformation so they survive without needing DB columns.
            const topInterestKeywords = String(lead?.interestKeywords || '').trim();
            const topCompanyLinkedin = String(lead?.companyLinkedin || '').trim();
            const baseAuth = (lead.authInformation && typeof lead.authInformation === 'object') ? { ...lead.authInformation } : {};
            const mergedAuth: any = { ...baseAuth };
            if (topInterestKeywords) mergedAuth.interest_keywords = topInterestKeywords;
            if (topCompanyLinkedin) mergedAuth.company_linkedin = topCompanyLinkedin;

            return {
                name: String(lead?.name || '').trim(),
                company: String(lead?.company || '').trim(),
                email: String(lead?.email || '').trim(),
                companyOwner: lead?.companyOwner || '',
                location: lead.location || '',
                website: lead.website || '',
                phone: lead.phone || '',
                linkedinProfile: lead.linkedinProfile || '',
                authInformation: Object.keys(mergedAuth).length > 0 ? mergedAuth : (lead.authInformation ?? null),
                status: lead.status || 'active',
            stage: lead.stage || 'new_leads',
            notes: lead.notes || '',
            tags: Array.isArray(lead.tags) ? lead.tags : [],
            source: lead.source || 'import',
            industry: lead.industry || '',
            googleAds: !!lead.googleAds,
            googleAdsChecked: !!lead.googleAdsChecked,
            organicRanking: lead.organicRanking ?? null,
            isHighValue: !!lead.isHighValue,
            dealValue: lead.dealValue ?? null,
            probability: lead.probability ?? null,
            budget: lead.budget ?? null,
            closedDate: lead.closedDate || null,
            closedReason: lead.closedReason || '',
            lossReason: lead.lossReason || '',
            lossDescription: lead.lossDescription || '',
            address: lead.address || '',
            latitude: lead.latitude ?? null,
            longitude: lead.longitude ?? null,
            rating: lead.rating ?? null,
            reviews: lead.reviews ?? null,
            lastContactedAt: lead.lastContactedAt || null,
            lastEmailedAt: lead.lastEmailedAt || null,
            emailAutomationEnabled: typeof lead.emailAutomationEnabled === 'boolean' ? lead.emailAutomationEnabled : true,
            emailSequenceStartDate: lead.emailSequenceStartDate || null,
            emailSequenceActive: !!lead.emailSequenceActive,
            nextScheduledEmail: lead.nextScheduledEmail || null,
            emailSequenceStep: lead.emailSequenceStep ?? null,
            emailStoppedReason: lead.emailStoppedReason || '',
            emailRetryCount: lead.emailRetryCount ?? null,
            emailFailureCount: lead.emailFailureCount ?? null,
            emailLastAttempt: lead.emailLastAttempt || null,
            emailStatus: lead.emailStatus || '',
            emailErrors: lead.emailErrors ?? null,
            emailValidationStatus: lead.emailValidationStatus || 'notScanned',
            emailValidationCheckedAt: lead.emailValidationCheckedAt || null,
            emailValidationDetails: lead.emailValidationDetails ?? null,
            outreachRecipient: lead.outreachRecipient || 'lead',
            senderIdentity: lead.senderIdentity || 'company',
            emailHistory: lead.emailHistory ?? null,
            nextFollowUpDate: lead.nextFollowUpDate || null,
            followUpCount: lead.followUpCount ?? null,
            createdAt: lead.createdAt || null,
        };
        };

        // Collect all parsed leads across files
        const allParsedLeads: any[] = [];
        let skippedNoEmail = 0;
        let totalRowsSeen = 0;

        for (const file of validFiles) {
            try {
                const text = await file.text();
                const isCsv = file.name.toLowerCase().endsWith('.csv');
                let rawLeads: any[] = [];

                if (isCsv) {
                    rawLeads = parseCsv(text).map(mapCsvRow);
                } else {
                    const parsed = JSON.parse(text);
                    rawLeads = (Array.isArray(parsed)
                        ? parsed
                        : (Array.isArray((parsed as any)?.leads) ? (parsed as any).leads : [parsed])
                    ).map(mapJsonLead);
                }

                totalRowsSeen += rawLeads.length;
                // Email is mandatory - skip rows without a valid-looking email
                for (const lead of rawLeads) {
                    if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
                        skippedNoEmail += 1;
                        continue;
                    }
                    allParsedLeads.push(lead);
                }
            } catch (err) {
                console.error(`Failed to parse file ${file.name}:`, err);
                toast.error(`Failed to parse ${file.name}`);
            }
        }

        // Deduplicate within the batch by email (case-insensitive).
        // If the same email appears multiple times, keep the first occurrence.
        const seenEmails = new Set<string>();
        let duplicateInBatch = 0;
        const dedupedLeads: any[] = [];
        for (const lead of allParsedLeads) {
            const emailKey = String(lead.email).toLowerCase().trim();
            if (seenEmails.has(emailKey)) {
                duplicateInBatch += 1;
                continue;
            }
            seenEmails.add(emailKey);
            dedupedLeads.push(lead);
        }

        // Filter: require at least a name + email. Company is already set by mapCsvRow
        // (with email-domain / LinkedIn fallback), so no industry fallback here.
        const cleanedLeads = dedupedLeads.filter((lead: any) => lead.name && lead.email);

        if (cleanedLeads.length === 0) {
            const msg = skippedNoEmail > 0
                ? `No valid leads found. ${skippedNoEmail} row(s) skipped (no email), ${duplicateInBatch} duplicate(s) removed.`
                : "No valid leads found. Each lead must include an email address.";
            toast.error(msg);
            return;
        }

        // Upload to backend sequentially (gentler on DB connection pool, shows real progress)
        let successCount = 0;
        let failureCount = 0;
        let duplicateCount = 0;
        const totalLeads = cleanedLeads.length;
        setImportProgress({ current: 0, total: totalLeads, success: 0, failed: 0, skipped: skippedNoEmail + duplicateInBatch });

        // Process in small batches to balance speed vs DB connection pressure
        const BATCH_SIZE = 5;
        for (let i = 0; i < cleanedLeads.length; i += BATCH_SIZE) {
            const batch = cleanedLeads.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
                batch.map((lead: any) =>
                    fetch('/api/leads', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': userId,
                        },
                        body: JSON.stringify(lead),
                    }).then(async (res) => {
                        if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            const errMsg = String(data?.error || `HTTP ${res.status}`);
                            // Mark DB duplicates separately from real failures
                            const isDup = res.status === 400 && /already exists/i.test(errMsg);
                            const err = new Error(errMsg);
                            (err as any).isDuplicate = isDup;
                            throw err;
                        }
                        return res.json();
                    })
                )
            );

            batchResults.forEach((r) => {
                if (r.status === 'fulfilled' && r.value?.success) {
                    successCount += 1;
                } else if (r.status === 'rejected' && (r.reason as any)?.isDuplicate) {
                    duplicateCount += 1;
                } else {
                    failureCount += 1;
                }
            });

            // Update progress after each batch
            const processed = Math.min(i + BATCH_SIZE, cleanedLeads.length);
            setImportProgress({
                current: processed,
                total: totalLeads,
                success: successCount,
                failed: failureCount,
                skipped: skippedNoEmail + duplicateInBatch + duplicateCount
            });
            // Yield to the UI thread so the loader can repaint
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Final summary toasts
        if (successCount > 0) {
            const parts = [`Imported ${successCount} lead${successCount !== 1 ? 's' : ''}`];
            if (skippedNoEmail > 0) parts.push(`${skippedNoEmail} skipped (no email)`);
            if (duplicateInBatch > 0) parts.push(`${duplicateInBatch} duplicate(s) in file`);
            if (duplicateCount > 0) parts.push(`${duplicateCount} already in database`);
            toast.success(parts.join(' · '));
        }
        if (failureCount > 0) {
            toast.error(`${failureCount} lead${failureCount !== 1 ? 's' : ''} failed (validation errors)`);
        }
        if (successCount === 0 && failureCount === 0 && (skippedNoEmail + duplicateInBatch + duplicateCount) > 0) {
            const reasons = [];
            if (skippedNoEmail > 0) reasons.push(`${skippedNoEmail} without email`);
            if (duplicateInBatch > 0) reasons.push(`${duplicateInBatch} duplicate(s) in file`);
            if (duplicateCount > 0) reasons.push(`${duplicateCount} already in database`);
            toast.error(`No new leads imported. ${reasons.join(', ')}.`);
        }

            // Refresh data to reflect new leads
            await fetchLeads();
            setIsImportOpen(false);

        } catch (error) {
            console.error('Error importing leads:', error);
            toast.error("Failed to import leads. Please check the file format.");
        } finally {
            setIsImporting(false);
            setImportProgress({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 });
        }
    };

    // Test send email functions
    const openTestSendDialog = async (lead: Lead) => {
        setTestSendLead(lead);
        setTestSendEmail(lead.email || '');
        setTestSendPreview(null);
        setTestSendLoading(true);
        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error("You must be signed in to send test emails");
                setTestSendLoading(false);
                return;
            }
            const res = await fetch(`/api/leads/test-send?leadId=${lead._id}&userId=${userId}`, {
                headers: { 'x-user-id': userId },
            });
            const data = await res.json();
            if (data.success && data.preview) {
                setTestSendPreview(data.preview);
            } else {
                toast.error(data.error || "Failed to generate email preview");
            }
        } catch (err) {
            console.error("Test send preview error:", err);
            toast.error("Failed to generate email preview");
        } finally {
            setTestSendLoading(false);
        }
    };

    const sendTestEmail = async () => {
        if (!testSendLead || !testSendEmail) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testSendEmail)) {
            toast.error("Please enter a valid email address");
            return;
        }
        setTestSendSending(true);
        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error("You must be signed in to send test emails");
                return;
            }
            const res = await fetch('/api/leads/test-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({
                    leadId: testSendLead._id,
                    testEmail: testSendEmail,
                    userId,
                    sendEmail: true,
                }),
            });
            const data = await res.json();
            if (data.success && data.sent) {
                toast.success(`Test email sent to ${testSendEmail}`);
            } else if (data.success && data.preview) {
                // Preview generated but send failed
                setTestSendPreview(data.preview);
                toast.error(data.sendError || "Failed to send email. Check SMTP settings.");
            } else {
                toast.error(data.error || "Failed to send test email");
            }
        } catch (err) {
            console.error("Test send error:", err);
            toast.error("Failed to send test email");
        } finally {
            setTestSendSending(false);
        }
    };

    // ===== Direct Send Email (from leads page — works for any lead) =====

    const openDirectSendDialog = async (lead: Lead) => {
        setDirectSendLead(lead);
        setDirectSendStage('');
        setDirectSendRecipient('lead');
        setDirectSendPreview(null);
        setDirectSendLoading(true);

        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error("You must be signed in to send emails");
                setDirectSendLoading(false);
                return;
            }

            // Fetch available email templates for this user
            const templatesRes = await fetch(`/api/email-templates?userId=${userId}`);
            const templatesData = await templatesRes.json();
            if (templatesData.success && templatesData.templates) {
                setEmailTemplates(templatesData.templates);
            }

            // Fetch preview for the first active template
            const res = await fetch(`/api/leads/test-send?leadId=${lead._id}&userId=${userId}`, {
                headers: { 'x-user-id': userId },
            });
            const data = await res.json();
            if (data.success && data.preview) {
                setDirectSendPreview(data.preview);
                setDirectSendStage(data.preview.templateStage || '');
            }
        } catch (err) {
            console.error("Direct send preview error:", err);
        } finally {
            setDirectSendLoading(false);
        }
    };

    const updateDirectSendPreview = async (stage: string) => {
        if (!directSendLead) return;
        setDirectSendStage(stage);
        setDirectSendLoading(true);
        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) return;
            const res = await fetch(`/api/leads/test-send?leadId=${directSendLead._id}&userId=${userId}&stage=${stage}`, {
                headers: { 'x-user-id': userId },
            });
            const data = await res.json();
            if (data.success && data.preview) {
                setDirectSendPreview(data.preview);
            }
        } catch (err) {
            console.error("Preview update error:", err);
        } finally {
            setDirectSendLoading(false);
        }
    };

    const sendDirectEmail = async () => {
        if (!directSendLead) return;
        setDirectSendSending(true);
        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error("You must be signed in to send emails");
                return;
            }

            const res = await fetch('/api/leads/send-direct-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: directSendLead._id,
                    userId,
                    stage: directSendStage || undefined,
                    recipientOption: directSendRecipient,
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`✅ Email sent to ${directSendRecipient === 'company' ? (directSendLead.authInformation as any)?.company_email || directSendLead.email : directSendLead.email}`);
                setDirectSendLead(null);
                setDirectSendPreview(null);
                await fetchLeads(); // Refresh leads to show updated status
            } else {
                toast.error(data.error || "Failed to send email");
            }
        } catch (err: any) {
            console.error("Direct send error:", err);
            toast.error(err.message || "Failed to send email");
        } finally {
            setDirectSendSending(false);
        }
    };

    // Enrich leads with company owner information
    const enrichLeadsWithOwners = async () => {
        try {
            setIsEnrichingOwners(true);
            toast.info("🔍 Starting company owner lookup for your leads...");
            
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                toast.error("User not authenticated. Please log in to enrich leads.");
                return;
            }

            const response = await fetch('/api/leads/enrich-owners', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                toast.success(`✅ ${data.message}`);
                await fetchLeads(); // Refresh the leads to show updated owner information
            } else {
                toast.error(data.error || 'Failed to enrich leads with owner information');
            }
        } catch (error) {
            console.error('Error enriching leads with owners:', error);
            toast.error("Failed to enrich leads with owner information. Please try again.");
        } finally {
            setIsEnrichingOwners(false);
        }
    };

    // Delete Leads function
    const deleteSelectedLeads = async () => {
        if (selectedLeads.size === 0) {
            showUniqueToast('No leads selected', 'error');
            return;
        }

        setIsDeleteLeadsDialogOpen(false);

        setIsDeletingLeads(true);

        try {
            const userId = await auth.getCurrentUserId();
            if (!userId) {
                showUniqueToast('Please login to delete leads', 'error');
                return;
            }

            const leadIds = Array.from(selectedLeads);
            const response = await fetch('/api/leads/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${userId}`,
                },
                body: JSON.stringify({ leadIds }),
            });

            const result = await response.json();

            if (result.success) {
                showUniqueToast(`✅ Successfully deleted ${result.deletedCount} leads!`, 'success');
                // Clear selection and refresh leads
                setSelectedLeads(new Set());
                fetchLeads();
                setIsSelectionMode(false);
            } else {
                showUniqueToast(`❌ Failed to delete leads: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting leads:', error);
            showUniqueToast('Failed to delete leads', 'error');
        } finally {
            setIsDeletingLeads(false);
        }
    };

    // Email Validation Status Badge Component
    const EmailValidationBadge = ({ status }: { status?: 'notScanned' | 'valid' | 'invalid' | 'checking' }) => {
        if (!status || status === 'notScanned') {
            return (
                <div className="flex items-center gap-1.5 text-yellow-600" title="Email not validated yet">
                    <BadgeAlert className="h-4 w-4" />
                    <span className="text-xs font-medium">Not Scanned</span>
                </div>
            );
        }
        
        if (status === 'checking') {
            return (
                <div className="flex items-center gap-1.5 text-blue-600" title="Validation in progress">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">Checking...</span>
                </div>
            );
        }
        
        if (status === 'valid') {
            return (
                <div className="flex items-center gap-1.5 text-green-600" title="Email is valid and deliverable">
                    <BadgeCheck className="h-4 w-4" />
                    <span className="text-xs font-medium">Valid</span>
                </div>
            );
        }
        
        if (status === 'invalid') {
            return (
                <div className="flex items-center gap-1.5 text-red-600" title="Email is invalid or undeliverable">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Invalid</span>
                </div>
            );
        }
        
        return null;
    };

    return (
        <div className="animate-in">
            {/* Current User Information */}
            {currentUser && (
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {currentUser.username.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-semibold text-purple-800">
                                    {String(t("welcome"))}, {currentUser.username}!
                                </h3>
                                <p className="text-sm text-purple-600">
                                    {String(t("userIdLabel"))}: {currentUser.id} | {String(t("email"))}: {currentUser.email}
                                </p>
                                <p className="text-xs text-purple-500 mt-1">
                                    {String(t("leadsAssignedAutomatically"))}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-medium text-purple-800">
                                {String(t("sessionActive"))}
                            </div>
                            <div className="text-xs text-purple-600">
                                {auth.getRemainingTime()} {String(t("hoursRemaining"))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Enhanced Lead Collection Notification */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Star className="h-5 w-5 text-green-600" />
                        <h3 className="font-semibold text-green-800">
                            {t("productionBackgroundJobSystem")}
                        </h3>
                    </div>
                    {process.env.NODE_ENV !== 'development' && (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                    try {
                                        const response = await fetch('/api/cron/health');
                                        const data = await response.json();
                                        
                                        if (data.healthy) {
                                            toast.success(`✅ Cronjob System: ${data.message}`);
                                        } else {
                                            toast.error(`⚠️ Issues Detected: ${data.data?.issues?.join(', ') || 'Unknown issues'}`);
                                        }
                                    } catch (error) {
                                        toast.error('Failed to check system health');
                                    }
                                }}
                                className="text-xs"
                            >
                                {t("checkHealth")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                    try {
                                        toast.loading(t("testingCronjob"), { duration: 5000 });
                                        const response = await fetch('/api/cron/health', { method: 'POST' });
                                        const data = await response.json();
                                        
                                        if (data.success) {
                                            toast.success(t("cronjobTestSuccess"));
                                        } else {
                                            toast.error(`${t("cronjobTestFailed")}: ${data.error}`);
                                        }
                                    } catch (error) {
                                        toast.error(t("failedToTestCronjob"));
                                    }
                                }}
                                className="text-xs"
                            >
                                {t("testCronjob")}
                            </Button>
                        </div>
                    )}
                </div>
                <p className="text-sm text-green-700">
                    {process.env.NODE_ENV === 'development' ? (
                        <>
                            <strong>{t("localProcessing")}</strong> {t("localProcessingDesc")}
                        </>
                    ) : (
                        <>
                            <strong>{t("backgroundProcessing")}</strong> {t("backgroundProcessingDesc")}
                            <br />
                            <strong>{t("proTimeout")}</strong> {t("proTimeoutDesc")}
                        </>
                    )}
                </p>
                
                {/* NEW: Step-by-Step Processing Explanation */}
                <div className="mt-3 p-3 bg-white rounded border border-green-300">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-blue-800">{String(t("stepByStepProcessingSystem"))}</span>
                    </div>
                    <div className="text-xs text-blue-700 space-y-1">
                        <div><strong>{String(t("howItWorks"))}</strong></div>
                        <div>• {String(t("cronJobRunsEveryFiveMinutes"))}</div>
                        <div>• {String(t("processesOneServiceLocationCombination"))}</div>
                        <div>• {String(t("processingExample"))}</div>
                        <div>• Step 1: Web Design + Miami (5 min)</div>
                        <div>• Step 2: Web Design + Orlando (5 min)</div>
                        <div>• Step 3: SEO + Miami (5 min)</div>
                        <div>• Step 4: SEO + Orlando (5 min)</div>
                        <div>• {String(t("totalTime"))}: ~20 minutes (4 steps × 5 min each)</div>
                    </div>
                </div>
            </div>

            <SectionHeader
                title={String(t("leadsCollectionTitle"))}
                description={String(t("leadsCollectionDescription"))}
            />

            {/* NEW: Active Jobs Summary */}
            {activeJobsCount > 0 && (
                <Card className="mb-6 border-blue-200 bg-blue-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Play className="h-5 w-5 text-blue-600" />
                                <span className="font-medium text-blue-800">
                                    {leadCountLabel(activeJobsCount, "activeJob", "activeJobs")} {String(t("activeJobsInQueueLabel")).toLowerCase()}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={fetchJobQueue}
                                    className="ml-2"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                            {/* Job progress controls removed - new system uses background cron jobs */}
                        </div>
                        {/* Debug info - remove in production */}
                        {process.env.NODE_ENV === 'development' && (
                            <div className="mt-2 text-xs text-blue-600">
                                Debug: {jobQueue.length} total jobs, {activeJobsCount} active
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Job Progress Section removed - new TemporaryLead system uses background cron jobs */}

            <Card className="mt-6 bg-card">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <Label htmlFor="services">{String(t("enterServices"))}</Label>
                            <Input
                                id="services"
                                placeholder={String(t("servicesPlaceholder"))}
                                value={services}
                                onChange={e => setServices(e.target.value)}
                                className="mt-1"
                                disabled={isLoading}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {String(t("servicesListDescription"))}
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="locations">{t("enterLocations")}</Label>
                            <Input
                                id="locations"
                                placeholder={String(t("locationsPlaceholder"))}
                                value={locations}
                                onChange={e => setLocations(e.target.value)}
                                className="mt-1"
                                disabled={isLoading}
                            />
                            <span className="text-muted-foreground text-xs">{t("locationsDescription")}</span>
                        </div>
                    </div>

                    {/* NEW: Processing Preview */}
                    {services && locations && (
                        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span className="text-sm font-medium text-gray-800">{String(t("processingPreview"))}</span>
                            </div>
                            <div className="text-xs text-gray-600 space-y-1">
                                {(() => {
                                    const servicesList = services.split(',').map(s => s.trim()).filter(Boolean);
                                    const locationsList = locations.split(',').map(l => l.trim()).filter(Boolean);
                                    const totalSteps = servicesList.length * locationsList.length;
                                    
                                    return (
                                        <>
                                            <div><strong>{String(t("totalSteps"))}:</strong> {totalSteps} {String(t("combinations"))}</div>
                                            <div><strong>{String(t("estimatedTime"))}:</strong> ~{Math.ceil(totalSteps * 5 / 60)} minutes</div>
                                            <div className="mt-2"><strong>{String(t("processingOrder"))}:</strong></div>
                                            {servicesList.map((service, serviceIndex) => (
                                                <div key={service} className="ml-2">
                                                    <div className="font-medium">{service}:</div>
                                                    {locationsList.map((location, locationIndex) => {
                                                        const stepNumber = serviceIndex * locationsList.length + locationIndex + 1;
                                                        return (
                                                            <div key={location} className="ml-4 text-gray-500">
                                                                Step {stepNumber}: {service} + {location}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* High Value Leads toggle removed */}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        {/* Number of leads section - HIDDEN */}
                        {/* <div>
                            <Label htmlFor="leadQuantity">{String(t("Number Of Leads"))}</Label>
                            <Select value={leadQuantity} onValueChange={setLeadQuantity} disabled={isLoading}>
                                <SelectTrigger className="mt-1 w-full">
                                    <SelectValue placeholder={String(t("selectQuantity"))} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5">5 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="10">10 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="20">20 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="50">50 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="100">100 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="200">200 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="500">500 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="1000">1000 {String(t("leads"))}</SelectItem>
                                    <SelectItem value="custom">{String(t("customAmount"))}</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            {leadQuantity === "custom" && (
                                <div className="mt-2">
                                    <Input
                                        type="number"
                                        placeholder="Enter custom number of leads"
                                        value={customLeadQuantity}
                                        onChange={(e) => setCustomLeadQuantity(e.target.value)}
                                        min="1"
                                        max="10000"
                                        disabled={isLoading}
                                        className="w-full"
                                    />
                                </div>
                            )}
                            
                            <p className="text-xs text-muted-foreground mt-1">
                                {String(t("Choose Leads Quantity"))}
                            </p>
                        </div> */}
                        <div className="flex flex-col items-start justify-end space-y-2 mt-6">
                            <Button
                                onClick={handleStartCollection}
                                disabled={!services || !locations || isLoading}
                                className="w-full md:w-auto text-zinc-50 bg-fuchsia-600 hover:bg-fuchsia-500"
                            >
                                {isLoading ? (
                                    <>
                                        <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                                        {t("queuingJob")}
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-4 w-4" />
                                        {t("startSimpleCollection")}
                                    </>
                                )}
                            </Button>
                            
                            {isLoading && (
                                <div className="w-full space-y-2">
                                    <Progress value={progress} className="w-full h-2" />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>{progressMessage}</span>
                                        <span>{collectedCount} {String(t("leadsCollected"))}</span>
                                    </div>
                                </div>
                            )}
                            
                            {/* Google Ads analysis progress is now integrated into main job progress */}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Separator className="my-8" />

            <div className="flex justify-between items-center">
                <SectionHeader
                    title={String(t("leadsList"))}
                    description={String(t("viewManageLeads"))}
                />
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchLeads}
                        disabled={isRefreshing}
                        title={String(t("refreshLeads"))}
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button 
                        variant="outline" 
                        className="flex items-center gap-1"
                        onClick={() => setIsExportOpen(true)}
                        title={String(t("exportLeadsDescription"))}
                    >
                        <Download className="h-4 w-4" />
                        <span>{String(t("export"))}</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="flex items-center gap-1"
                        onClick={() => setIsImportOpen(true)}
                        disabled={isImporting}
                        title={String(t("importLeadsDescription"))}
                    >
                        {isImporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span>{isImporting ? String(t("importing")) : String(t("import"))}</span>
                    </Button>
                    <Button 
                        variant="outline" 
                        className="flex items-center gap-1 text-green-600 border-green-200 hover:bg-green-50"
                        disabled={selectedLeads.size === 0 || isRecheckingEmails}
                        onClick={openRecheckDialog}
                        title={selectedLeads.size === 0 ? String(t("toggleLeadSelectionMode")) : String(t("recheckEmailValidationTitle")).replace("{count}", String(selectedLeads.size))}
                    >
                        <ShieldCheck className="h-4 w-4" />
                        <span>{isRecheckingEmails ? String(t("startingRecheck")) : String(t("recheckEmails"))}</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={isCleaningEmails}
                        onClick={() => setIsCleanInvalidDialogOpen(true)}
                        title={String(t("removeLeadsWithInvalidEmails"))}
                    >
                        <XCircle className="h-4 w-4" />
                        <span>{isCleaningEmails ? String(t("cleaningInvalid")) : String(t("cleanInvalidEmails"))}</span>
                    </Button>
                    <Button 
                        variant="outline" 
                        className="flex items-center gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                        disabled={isCleaningDuplicates}
                        onClick={() => setIsCleanDuplicatesDialogOpen(true)}
                        title={String(t("removeDuplicateLeads"))}
                    >
                        <Trash2 className="h-4 w-4" />
                        <span>{isCleaningDuplicates ? String(t("cleaningDuplicatesLabel")) : String(t("cleanDuplicates"))}</span>
                    </Button>
                    <Button 
                        variant="outline" 
                        className="flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={toggleSelectionMode}
                        title={String(t("toggleLeadSelectionMode"))}
                    >
                        <Mail className="h-4 w-4" />
                        <span>{String(t(isSelectionMode ? "cancelSelection" : "selectLeads"))}</span>
                    </Button>
                    <Button 
                        variant="outline" 
                        className="flex items-center gap-1"
                        onClick={() => setIsViewAllOpen(true)}
                        title={String(t("viewAllLeads"))}
                    >
                        <span>{t("viewAll")}</span>
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Email Validation Progress Banner */}
            {isValidationRunning && (
                <Card className="mt-6 border-purple-300 bg-gradient-to-r from-purple-50 to-indigo-50">
                    <CardContent className="pt-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="h-5 w-5 text-purple-600 animate-spin" />
                                    <span className="font-semibold text-purple-800 text-lg">
                                        Email Validation in Progress
                                    </span>
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={stopValidationTracking}
                                    className="border-purple-300 text-purple-700 hover:bg-purple-100"
                                >
                                    Stop Tracking
                                </Button>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white rounded-lg p-3 border border-blue-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                                        <span className="text-xs text-blue-600 font-medium">Checking Now</span>
                                    </div>
                                    <div className="text-2xl font-bold text-blue-700">
                                        {validationProgress.checking}
                                    </div>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-green-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <BadgeCheck className="h-4 w-4 text-green-600" />
                                        <span className="text-xs text-green-600 font-medium">Valid</span>
                                    </div>
                                    <div className="text-2xl font-bold text-green-700">
                                        {validationProgress.valid}
                                    </div>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-red-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <XCircle className="h-4 w-4 text-red-600" />
                                        <span className="text-xs text-red-600 font-medium">{String(t("invalid"))}</span>
                                    </div>
                                    <div className="text-2xl font-bold text-red-700">
                                        {validationProgress.invalid}
                                    </div>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-yellow-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <BadgeAlert className="h-4 w-4 text-yellow-600" />
                                        <span className="text-xs text-yellow-600 font-medium">{String(t("pending"))}</span>
                                    </div>
                                    <div className="text-2xl font-bold text-yellow-700">
                                        {validationProgress.notScanned}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-lg p-3 border border-purple-200">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-purple-700">
                                        <strong>{String(t("autoRefreshingRealtime")).split(" - ")[0]}</strong> - {String(t("autoRefreshingRealtime")).split(" - ")[1]}
                                    </span>
                                    <span className="text-purple-600 text-xs">
                                        ⏰ {String(t("processingBatchesInfo"))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Email Queue Selection Status Panel */}
            {isSelectionMode && (
                <Card className="mt-6 border-blue-200 bg-blue-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Mail className="h-5 w-5 text-blue-600" />
                                <span className="font-medium text-blue-800">
                                    {`${t("leadSelection")}: ${selectedLeads.size} ${selectedLeads.size !== 1 ? t("leadsSelected") : t("leadSelected")}`}
                                </span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {!isRepliesTab && (
                                    <Select value={selectedSenderIdentity} onValueChange={(v) => setSelectedSenderIdentity(v as 'company' | 'author')}>
                                        <SelectTrigger className="w-[170px]">
                                            <SelectValue placeholder="Sending Name" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="company">Company Name</SelectItem>
                                            <SelectItem value="author">Owner Name</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedLeads(new Set())}
                                    className="border-blue-300 text-blue-700 hover:bg-blue-100"
                                >
                                    {t("clearSelection")}
                                </Button>
                                {selectedLeads.size > 0 && (
                                    <>
                                        {!isRepliesTab && (
                                            <Button
                                                size="sm"
                                                onClick={startEmailAutomation}
                                                disabled={isStartingEmailAutomation || isAddingToCRM}
                                                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                                                title={String(t("startAutomatedEmailSequence"))}
                                            >
                                                {isStartingEmailAutomation ? (
                                                    <>
                                                        <RotateCw className="h-4 w-4 animate-spin mr-2" />
                                                        {t("starting")}
                                                    </>
                                                ) : (
                                                    <>
                                                        🚀 {`${t("startAutomation")} (${selectedLeads.size})`}
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={openDeleteLeadsDialog}
                                            disabled={isAddingToCRM || isStartingEmailAutomation || isDeletingLeads}
                                            className="bg-red-500 text-white hover:bg-rose-400 flex-1 cursor-pointer"
                                            title={String(t("permanentlyDeleteSelectedLeads"))}
                                        >
                                            {isDeletingLeads ? (
                                                <>
                                                    <RotateCw className="h-4 w-4 animate-spin mr-2" />
                                                    {t("deleting")}
                                                </>
                                            ) : (
                                                <>
                                                    🗑️ {`${t("deleteLeads")} (${selectedLeads.size})`}
                                                </>
                                            )}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        {selectedLeads.size > 0 && (() => {
                            // Calculate validation status for selected leads
                            const leadIds = Array.from(selectedLeads);
                            const selectedLeadsData = filteredLeads.filter(lead => leadIds.includes(lead._id));
                            
                            const validCount = selectedLeadsData.filter(lead => lead.emailValidationStatus === 'valid').length;
                            const notValidatedCount = selectedLeadsData.filter(lead => 
                                !lead.emailValidationStatus || 
                                lead.emailValidationStatus === 'notScanned' || 
                                lead.emailValidationStatus === 'checking'
                            ).length;
                            const invalidCount = selectedLeadsData.filter(lead => lead.emailValidationStatus === 'invalid').length;
                            
                            const allValidated = notValidatedCount === 0 && invalidCount === 0;
                            
                            return (
                                <>
                                    {/* Validation Status Warning */}
                                    <div className={`mt-3 p-3 rounded border ${allValidated ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <ShieldCheck className={`h-5 w-5 ${allValidated ? 'text-green-600' : 'text-yellow-600'}`} />
                                            <span className={`font-semibold ${allValidated ? 'text-green-800' : 'text-yellow-800'}`}>
                                                Email Validation Status
                                            </span>
                                        </div>
                                        <div className="ml-7 space-y-1 text-sm">
                                            <div className="flex items-center gap-2">
                                                <BadgeCheck className="h-4 w-4 text-green-600" />
                                                <span className="text-green-700">Valid: <strong>{validCount}/{selectedLeadsData.length}</strong></span>
                                            </div>
                                            {notValidatedCount > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <BadgeAlert className="h-4 w-4 text-yellow-600" />
                                                    <span className="text-yellow-700">Not Validated: <strong>{notValidatedCount}</strong></span>
                                                </div>
                                            )}
                                            {invalidCount > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-red-600" />
                                                    <span className="text-red-700">Invalid: <strong>{invalidCount}</strong></span>
                                                </div>
                                            )}
                                            {!allValidated && (
                                                <div className="mt-2 p-2 bg-white rounded border border-yellow-200">
                                                    <p className="text-yellow-800 text-xs font-medium">
                                                        ⚠️ Email automation requires ALL emails to be validated and valid!
                                                    </p>
                                                    <p className="text-yellow-700 text-xs mt-1">
                                                        Click "Re Check Emails" after selecting leads to re-run validation.
                                                    </p>
                                                </div>
                                            )}
                                            {allValidated && (
                                                <div className="mt-2 p-2 bg-white rounded border border-green-200">
                                                    <p className="text-green-800 text-xs font-medium">
                                                        ✅ All selected emails are validated! Ready to start automation.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Options Section */}
                                    <div className="mt-3 p-3 bg-white rounded border text-sm text-gray-600">
                                        <div className="flex items-start gap-2">
                                            <div className="text-blue-600 font-semibold">{t("options")}:</div>
                                        </div>
                                        <div className="ml-2 mt-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-blue-600">🚀</span>
                                                <span><strong>{t("startAutomation")}:</strong> {t("usesEmailTemplatesFromEmailPrompting")}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-red-600">🗑️</span>
                                                <span><strong>{t("permanentlyDeleteSelectedLeads")}:</strong> {t("permanentlyRemoveSelectedLeadsFromDatabase")}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                        {selectedLeads.size > 0 && isRepliesTab && (
                            <div className="mt-3 p-3 bg-white rounded border text-sm text-gray-600">
                                <div className="flex items-start gap-2">
                                    <div className="text-red-600 font-semibold">Delete:</div>
                                </div>
                                <div className="ml-2 mt-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-red-600">🗑️</span>
                                        <span>Permanently remove selected reply leads from database.</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Global progress for search jobs and temporary leads */}
            <div className="mt-6">
                <SearchJobsProgress />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-4">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto">
                        <TabsTrigger value="new-leads" className="text-xs sm:text-sm">
                            <span className="truncate">{t("newLeads")}</span>
                            {newLeads.length > 0 && (
                                <span className="ml-1 sm:ml-2 px-1 sm:px-2 py-0.5 text-xs bg-fuchsia-600 text-white rounded-full">
                                    {newLeads.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="processing-leads" className="text-xs sm:text-sm">
                            <span className="truncate">{t("processing")}</span>
                            {processingLeads.length > 0 && (
                                <span className="ml-1 sm:ml-2 px-1 sm:px-2 py-0.5 text-xs bg-fuchsia-600 text-white rounded-full">
                                    {processingLeads.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="emailed-leads" className="text-xs sm:text-sm">
                            <span className="truncate">{t("emailed")}</span>
                            {emailedLeads.length > 0 && (
                                <span className="ml-1 sm:ml-2 px-1 sm:px-2 py-0.5 text-xs bg-fuchsia-600 text-white rounded-full">
                                    {emailedLeads.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="replied-leads" className="text-xs sm:text-sm">
                            <span className="truncate">💬 Replies</span>
                            {repliedLeads.length > 0 && (
                                <span className="ml-1 sm:ml-2 px-1 sm:px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">
                                    {repliedLeads.length}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex gap-2 flex-col sm:flex-row">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={String(t("searchLeads"))}
                                className="pl-8 w-full sm:w-[250px] min-w-0"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="icon" className="shrink-0">
                            <Filter className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <TabsContent value="new-leads">
                    <Card className="bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isSelectionMode && (
                                            <TableHead className="w-[50px]">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeads.has(lead._id))}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </TableHead>
                                        )}
                                        <TableHead className="min-w-[150px]">{String(t("name"))}</TableHead>
                                        <TableHead className="min-w-[100px]">{String(t("role"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("company"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("location"))}</TableHead>
                                        <TableHead className="min-w-[180px]">{String(t("email"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("emailStatus"))}</TableHead>
                                        <TableHead className="min-w-[80px]">{String(t("rating"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("emailAutomation"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("authInfo"))}</TableHead>
                                        <TableHead className="min-w-[140px]">{String(t("status"))}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLeads.length > 0 ? (
                                        filteredLeads.map(lead => (
                                            <TableRow key={lead._id} className={lead.googleAds && (lead.organicRanking === undefined || lead.organicRanking > 10) ? "bg-amber-50/50" : ""}>
                                                {isSelectionMode && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLeads.has(lead._id)}
                                                            onChange={() => toggleLeadSelection(lead._id)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <div className="flex items-center gap-2 max-w-[150px]">
                                                                <span className={`truncate ${info.isNotFound ? 'italic text-muted-foreground' : ''}`} title={info.name}>{info.name}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <span className={`text-xs truncate block max-w-[100px] ${info.role === '-' ? 'text-muted-foreground' : 'text-gray-700 font-medium'}`} title={info.role}>
                                                                {info.role}
                                                            </span>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="truncate block max-w-[200px]" title={lead.company}>
                                                        {lead.company}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <span className="truncate block max-w-[120px]" title={lead.location}>
                                                        {lead.location}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <button
                                                        onClick={(e) => copyEmailToClipboard(e, lead.email)}
                                                        className="truncate block max-w-[180px] text-sm text-left hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 cursor-pointer p-1 rounded w-full"
                                                        title={`Click to copy: ${lead.email}`}
                                                    >
                                                        {lead.email}
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    <EmailValidationBadge status={lead.emailValidationStatus} />
                                                </TableCell>
                                                <TableCell>
                                                    {lead.rating ? (
                                                        <div className="flex items-center gap-1 text-sm">
                                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                            <span className="font-medium">{lead.rating}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                {/* Google Ads status removed */}
                                                <TableCell>
                                                    <EmailStatus lead={lead} onRefresh={fetchLeads} />
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setAuthInfoLead(lead)}
                                                    >
                                                        {String(t("view"))}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <StatusBadge status={lead.status} />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openDirectSendDialog(lead); }}
                                                            title="Send email to this lead"
                                                        >
                                                            <Mail className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openTestSendDialog(lead); }}
                                                            title="Send test email"
                                                        >
                                                            <Send className="h-3.5 w-3.5 text-green-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => setDetailsLead(lead)}
                                                            title="View full lead details"
                                                        >
                                                            <Info className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isSelectionMode ? 12 : 11} className="text-center py-6 text-muted-foreground">
                                                {isRefreshing ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <RotateCw className="h-4 w-4 animate-spin" />
                                                        <span>{t("refreshingLeads")}</span>
                                                    </div>
                                                ) : String(t("😞 No Leads Found"))}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="processing-leads">
                    <Card className="bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isSelectionMode && (
                                            <TableHead className="w-[50px]">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeads.has(lead._id))}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </TableHead>
                                        )}
                                        <TableHead className="min-w-[150px]">{String(t("name"))}</TableHead>
                                        <TableHead className="min-w-[100px]">{String(t("role"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("company"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("location"))}</TableHead>
                                        <TableHead className="min-w-[180px]">{String(t("email"))}</TableHead>
                                        <TableHead className="min-w-[80px]">{String(t("rating"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("emailAutomation"))}</TableHead>
                                        <TableHead className="min-w-[140px]">{String(t("status"))}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLeads.length > 0 ? (
                                        filteredLeads.map(lead => (
                                            <TableRow key={lead._id} className={lead.googleAds && (lead.organicRanking === undefined || lead.organicRanking > 10) ? "bg-amber-50/50" : ""}>
                                                {isSelectionMode && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLeads.has(lead._id)}
                                                            onChange={() => toggleLeadSelection(lead._id)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <div className="flex items-center gap-2 max-w-[150px]">
                                                                <span className={`truncate ${info.isNotFound ? 'italic text-muted-foreground' : ''}`} title={info.name}>{info.name}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <span className={`text-xs truncate block max-w-[100px] ${info.role === '-' ? 'text-muted-foreground' : 'text-gray-700 font-medium'}`} title={info.role}>
                                                                {info.role}
                                                            </span>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="truncate block max-w-[200px]" title={lead.company}>
                                                        {lead.company}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <span className="truncate block max-w-[120px]" title={lead.location}>
                                                        {lead.location}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <a
                                                        href={`https://${lead.linkedinProfile}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[#9c55dc] hover:underline text-sm"
                                                    >
                                                        {String(t("profile"))}
                                                    </a>
                                                </TableCell>
                                                <TableCell>
                                                    <button
                                                        onClick={(e) => copyEmailToClipboard(e, lead.email)}
                                                        className="truncate block max-w-[180px] text-sm text-left hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 cursor-pointer p-1 rounded w-full"
                                                        title={`Click to copy: ${lead.email}`}
                                                    >
                                                        {lead.email}
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    {lead.rating ? (
                                                        <div className="flex items-center gap-1 text-sm">
                                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                            <span className="font-medium">{lead.rating}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                {/* Google Ads status removed */}
                                                <TableCell>
                                                    <EmailStatus lead={lead} onRefresh={fetchLeads} />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <StatusBadge status={lead.status} />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openDirectSendDialog(lead); }}
                                                            title="Send email to this lead"
                                                        >
                                                            <Mail className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openTestSendDialog(lead); }}
                                                            title="Send test email"
                                                        >
                                                            <Send className="h-3.5 w-3.5 text-green-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => setDetailsLead(lead)}
                                                            title="View full lead details"
                                                        >
                                                            <Info className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isSelectionMode ? 11 : 10} className="text-center py-6 text-muted-foreground">
                                                {isRefreshing ? t("loadingLeads") : String(t("noLeadsFound"))}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="emailed-leads">
                    <Card className="bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isSelectionMode && (
                                            <TableHead className="w-[50px]">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeads.has(lead._id))}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </TableHead>
                                        )}
                                        <TableHead className="min-w-[150px]">{String(t("name"))}</TableHead>
                                        <TableHead className="min-w-[100px]">{String(t("role"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("company"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("location"))}</TableHead>
                                        <TableHead className="min-w-[180px]">{String(t("email"))}</TableHead>
                                        <TableHead className="min-w-[80px]">{String(t("rating"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("emailAutomation"))}</TableHead>
                                        <TableHead className="min-w-[140px]">{String(t("status"))}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLeads.length > 0 ? (
                                        filteredLeads.map(lead => (
                                            <TableRow key={lead._id} className={lead.googleAds && (lead.organicRanking === undefined || lead.organicRanking > 10) ? "bg-amber-50/50" : ""}>
                                                {isSelectionMode && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLeads.has(lead._id)}
                                                            onChange={() => toggleLeadSelection(lead._id)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <div className="flex items-center gap-2 max-w-[150px]">
                                                                <span className={`truncate ${info.isNotFound ? 'italic text-muted-foreground' : ''}`} title={info.name}>{info.name}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <span className={`text-xs truncate block max-w-[100px] ${info.role === '-' ? 'text-muted-foreground' : 'text-gray-700 font-medium'}`} title={info.role}>
                                                                {info.role}
                                                            </span>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="truncate block max-w-[200px]" title={lead.company}>
                                                        {lead.company}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <span className="truncate block max-w-[120px]" title={lead.location}>
                                                        {lead.location}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <a
                                                        href={`https://${lead.linkedinProfile}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[#9c55dc] hover:underline text-sm"
                                                    >
                                                        {String(t("profile"))}
                                                    </a>
                                                </TableCell>
                                                <TableCell>
                                                    <button
                                                        onClick={(e) => copyEmailToClipboard(e, lead.email)}
                                                        className="truncate block max-w-[180px] text-sm text-left hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 cursor-pointer p-1 rounded w-full"
                                                        title={`Click to copy: ${lead.email}`}
                                                    >
                                                        {lead.email}
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    {lead.rating ? (
                                                        <div className="flex items-center gap-1 text-sm">
                                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                            <span className="font-medium">{lead.rating}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                {/* Google Ads status removed */}
                                                <TableCell>
                                                    <EmailStatus lead={lead} onRefresh={fetchLeads} />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <StatusBadge status={lead.status} />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openDirectSendDialog(lead); }}
                                                            title="Send email to this lead"
                                                        >
                                                            <Mail className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openTestSendDialog(lead); }}
                                                            title="Send test email"
                                                        >
                                                            <Send className="h-3.5 w-3.5 text-green-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => setDetailsLead(lead)}
                                                            title="View full lead details"
                                                        >
                                                            <Info className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isSelectionMode ? 11 : 10} className="text-center py-6 text-muted-foreground">
                                                {isRefreshing ? t("loadingLeads") : String(t("noLeadsFound"))}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="replied-leads">
                    <Card className="bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {isSelectionMode && (
                                            <TableHead className="w-[50px]">
                                                <input
                                                    type="checkbox"
                                                    checked={filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeads.has(lead._id))}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </TableHead>
                                        )}
                                        <TableHead className="min-w-[150px]">{String(t("name"))}</TableHead>
                                        <TableHead className="min-w-[100px]">{String(t("role"))}</TableHead>
                                        <TableHead className="min-w-[200px]">{String(t("company"))}</TableHead>
                                        <TableHead className="min-w-[120px]">{String(t("location"))}</TableHead>
                                        <TableHead className="min-w-[180px]">{String(t("email"))}</TableHead>
                                        <TableHead className="min-w-[80px]">{String(t("rating"))}</TableHead>
                                        <TableHead className="min-w-[150px]">{String(t("lastContacted"))}</TableHead>
                                        <TableHead className="min-w-[140px]">{String(t("status"))}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLeads.length > 0 ? (
                                        filteredLeads.map(lead => (
                                            <TableRow key={lead._id} className="bg-green-50/30">
                                                {isSelectionMode && (
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLeads.has(lead._id)}
                                                            onChange={() => toggleLeadSelection(lead._id)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell className="font-medium">
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <div className="flex items-center gap-2 max-w-[150px]">
                                                                <span className={`truncate ${info.isNotFound ? 'italic text-muted-foreground' : ''}`} title={info.name}>{info.name}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    {(() => {
                                                        const info = getLeadDisplayName(lead);
                                                        return (
                                                            <span className={`text-xs truncate block max-w-[100px] ${info.role === '-' ? 'text-muted-foreground' : 'text-gray-700 font-medium'}`} title={info.role}>
                                                                {info.role}
                                                            </span>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="truncate block max-w-[200px]" title={lead.company}>
                                                        {lead.company}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <span className="truncate block max-w-[120px]" title={lead.location}>
                                                        {lead.location}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <button
                                                        onClick={(e) => copyEmailToClipboard(e, lead.email)}
                                                        className="truncate block max-w-[180px] text-sm text-left hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 cursor-pointer p-1 rounded w-full"
                                                        title={`Click to copy: ${lead.email}`}
                                                    >
                                                        {lead.email}
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    {lead.rating ? (
                                                        <div className="flex items-center gap-1 text-sm">
                                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                            <span className="font-medium">{lead.rating}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {lead.lastContactedAt ? (
                                                        <span className="text-sm text-muted-foreground">
                                                            {new Date(lead.lastContactedAt).toLocaleDateString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <StatusBadge status={lead.status} />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openDirectSendDialog(lead); }}
                                                            title="Send email to this lead"
                                                        >
                                                            <Mail className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => { e.stopPropagation(); openTestSendDialog(lead); }}
                                                            title="Send test email"
                                                        >
                                                            <Send className="h-3.5 w-3.5 text-green-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => setDetailsLead(lead)}
                                                            title="View full lead details"
                                                        >
                                                            <Info className="h-3.5 w-3.5 text-blue-500" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={isSelectionMode ? 9 : 8} className="text-center py-6 text-muted-foreground">
                                                {isRefreshing ? t("loadingLeads") : String(t("noRepliedLeadsFound"))}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                {/* Removed High Value Leads content */}
            </Tabs>

            {/* View All Leads Dialog */}
            <Dialog open={isViewAllOpen} onOpenChange={setIsViewAllOpen}>
                <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{t("allLeads")}</DialogTitle>
                        <DialogDescription>
                            {t("completeOverview")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {isSelectionMode && (
                                        <TableHead className="w-[50px]">
                                            <input
                                                type="checkbox"
                                                checked={allLeads.length > 0 && allLeads.every(lead => selectedLeads.has(lead._id))}
                                                onChange={() => {
                                                    if (allLeads.every(lead => selectedLeads.has(lead._id))) {
                                                        setSelectedLeads(new Set());
                                                    } else {
                                                        setSelectedLeads(new Set(allLeads.map(lead => lead._id)));
                                                    }
                                                }}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead className="min-w-[150px]">{String(t("name"))}</TableHead>
                                    <TableHead className="min-w-[100px]">{String(t("role"))}</TableHead>
                                    <TableHead className="min-w-[200px]">{String(t("company"))}</TableHead>
                                    <TableHead className="min-w-[120px]">{String(t("location"))}</TableHead>
                                    <TableHead className="min-w-[180px]">{String(t("email"))}</TableHead>
                                    <TableHead className="min-w-[80px]">{String(t("rating"))}</TableHead>
                                    <TableHead className="min-w-[200px]">{String(t("emailAutomation"))}</TableHead>
                                    <TableHead className="min-w-[120px]">{String(t("authInfo"))}</TableHead>
                                    <TableHead className="min-w-[140px]">{String(t("status"))}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allLeads.length > 0 ? (
                                    allLeads.map(lead => (
                                        <TableRow key={lead._id} className={lead.googleAds && (lead.organicRanking === undefined || lead.organicRanking > 10) ? "bg-amber-50/50" : ""}>
                                            {isSelectionMode && (
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLeads.has(lead._id)}
                                                        onChange={() => toggleLeadSelection(lead._id)}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="font-medium">
                                                {(() => {
                                                    const info = getLeadDisplayName(lead);
                                                    return (
                                                        <div className="flex items-center gap-2 max-w-[150px]">
                                                            <span className={`truncate ${info.isNotFound ? 'italic text-muted-foreground' : ''}`} title={info.name}>{info.name}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const info = getLeadDisplayName(lead);
                                                    return (
                                                        <span className={`text-xs truncate block max-w-[100px] ${info.role === '-' ? 'text-muted-foreground' : 'text-gray-700 font-medium'}`} title={info.role}>
                                                            {info.role}
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                <span className="truncate block max-w-[200px]" title={lead.company}>
                                                    {lead.company}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="truncate block max-w-[120px]" title={lead.location}>
                                                    {lead.location}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <button
                                                    onClick={(e) => copyEmailToClipboard(e, lead.email)}
                                                    className="truncate block max-w-[180px] text-sm text-left hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 cursor-pointer p-1 rounded w-full"
                                                    title={`Click to copy: ${lead.email}`}
                                                >
                                                    {lead.email}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                {lead.rating ? (
                                                    <div className="flex items-center gap-1 text-sm">
                                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                        <span className="font-medium">{lead.rating}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </TableCell>
                                            {/* Google Ads status removed */}
                                            <TableCell>
                                                <EmailStatus lead={lead} onRefresh={fetchLeads} />
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setAuthInfoLead(lead)}
                                                >
                                                    {String(t("view"))}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <StatusBadge status={lead.status} />
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={(e) => { e.stopPropagation(); openDirectSendDialog(lead); }}
                                                        title="Send email to this lead"
                                                    >
                                                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={(e) => { e.stopPropagation(); openTestSendDialog(lead); }}
                                                        title="Send test email"
                                                    >
                                                        <Send className="h-3.5 w-3.5 text-green-500" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => setDetailsLead(lead)}
                                                        title="View full lead details"
                                                    >
                                                        <Info className="h-3.5 w-3.5 text-blue-500" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={isSelectionMode ? 12 : 11} className="text-center py-6 text-muted-foreground">
                                            {isRefreshing ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <RotateCw className="h-4 w-4 animate-spin" />
                                                    <span>{t("refreshingLeads")}</span>
                                                </div>
                                            ) : t("noLeadsFound")}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-4 shrink-0">{t("close")}</Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>

            {/* Export Modal */}
            <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{String(t("exportLeadsTitle"))}</DialogTitle>
                        <DialogDescription>
                            {String(t("exportLeadsDescription"))}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-3">
                        <Button 
                            onClick={() => exportLeads('csv')}
                            className="flex items-center gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {String(t("exportAsCSV"))}
                        </Button>
                        <Button 
                            onClick={() => exportLeads('json')}
                            className="flex items-center gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {String(t("exportAsJSON"))}
                        </Button>
                        <Button 
                            onClick={() => exportLeads('pdf')}
                            className="flex items-center gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {String(t("exportAsPDF"))}
                        </Button>
                    </div>
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-4">{String(t("cancel"))}</Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>

            {/* Import Modal */}
            <Dialog open={isImportOpen} onOpenChange={(open) => { if (!isImporting) setIsImportOpen(open); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{String(t("importLeadsTitle"))}</DialogTitle>
                        <DialogDescription>
                            {String(t("importLeadsDescription"))}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-3">
                        {isImporting ? (
                            /* Loader + progress shown while importing */
                            <div className="rounded-lg p-8 text-center space-y-4">
                                <RefreshCw className="h-10 w-10 mx-auto text-blue-500 animate-spin" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-gray-700">
                                        {String(t("importingLeads"))}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {importProgress.current} / {importProgress.total}
                                        {importProgress.total > 0 ? ` (${Math.round((importProgress.current / importProgress.total) * 100)}%)` : ''}
                                    </p>
                                </div>
                                {importProgress.total > 0 && (
                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                                            style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                        />
                                    </div>
                                )}
                                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                                    <div className="text-center">
                                        <div className="font-semibold text-green-600">{importProgress.success}</div>
                                        <div className="text-gray-500">{String(t("imported"))}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-red-600">{importProgress.failed}</div>
                                        <div className="text-gray-500">{String(t("failed"))}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-gray-600">{importProgress.skipped}</div>
                                        <div className="text-gray-500">{String(t("skipped"))}</div>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {String(t("doNotCloseWindow"))}
                                </p>
                            </div>
                        ) : (
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
                            }}
                            onDragLeave={(e) => {
                                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
                                const dropped = Array.from(e.dataTransfer.files);
                                const valid = dropped.filter(f => f.name.toLowerCase().endsWith('.json') || f.name.toLowerCase().endsWith('.csv'));
                                if (valid.length > 0) {
                                    importLeads(valid);
                                } else if (dropped.length > 0) {
                                    toast.error(String(t("onlyJsonFilesAccepted")));
                                }
                            }}
                        >
                            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                            <p className="text-sm text-gray-600 mb-2">
                                {String(t("dropJsonFileHere"))}
                            </p>
                            <p className="text-xs text-gray-500 mb-2">
                                Supports CSV (merged format: name, company, role, email, linkedin, company_linkedin, interest_keywords, ...) and JSON. Multiple files allowed.
                            </p>
                            <input
                                type="file"
                                accept=".json,application/json,.csv,text/csv"
                                multiple
                                ref={fileInputRef}
                                onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    if (files.length > 0) {
                                        importLeads(files);
                                        // reset so same file selection triggers change again later
                                        e.currentTarget.value = '';
                                    }
                                }}
                                className="hidden"
                                id="import-file"
                            />
                            <Button
                                variant="outline"
                                className="cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {String(t("chooseFile"))}
                            </Button>
                        </div>
                        )}
                    </div>
                    {!isImporting && (
                        <DialogClose asChild>
                            <Button variant="outline" className="mt-4">{String(t("cancel"))}</Button>
                        </DialogClose>
                    )}
                </DialogContent>
            </Dialog>

            {/* Test Send Email Dialog */}
            <Dialog open={!!testSendLead} onOpenChange={(open) => { if (!testSendSending) { setTestSendLead(null); setTestSendPreview(null); } }}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5 text-green-500" />
                            Test Send Email
                        </DialogTitle>
                        <DialogDescription>
                            Preview and send a test email using this lead's actual data.
                        </DialogDescription>
                    </DialogHeader>
                    {testSendLead && (
                        <div className="space-y-4">
                            {/* Lead info summary */}
                            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lead:</span>
                                    <span className="font-medium">{testSendLead.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Company:</span>
                                    <span className="font-medium">{testSendLead.company}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lead's email:</span>
                                    <span className="font-medium text-blue-600">{testSendLead.email}</span>
                                </div>
                                {testSendLead.authInformation?.role && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Role:</span>
                                        <span className="font-medium">{testSendLead.authInformation.role}</span>
                                    </div>
                                )}
                            </div>

                            {/* Send to email input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Send test email to:</label>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={testSendEmail}
                                        onChange={(e) => setTestSendEmail(e.target.value)}
                                        placeholder="Enter email address to send test to"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        disabled={testSendSending}
                                    />
                                    <Button
                                        onClick={sendTestEmail}
                                        disabled={testSendSending || !testSendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testSendEmail)}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                    >
                                        {testSendSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        <span className="ml-1">{testSendSending ? "Sending..." : "Send Test"}</span>
                                    </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    The email will be sent with subject prefixed with [TEST]. The lead's actual email is shown above.
                                </p>
                            </div>

                            {/* Email preview */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">Email Preview (what the lead will see):</label>
                                    {testSendPreview && (
                                        <span className="text-xs text-gray-500">Stage: {testSendPreview.templateStage}</span>
                                    )}
                                </div>
                                {testSendLoading ? (
                                    <div className="flex items-center justify-center py-12 border rounded-lg bg-gray-50">
                                        <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                                        <span className="ml-2 text-sm text-gray-500">Generating email preview...</span>
                                    </div>
                                ) : testSendPreview ? (
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="bg-gray-100 px-3 py-2 text-xs text-gray-600 border-b">
                                            <div><strong>Subject:</strong> [TEST] {testSendPreview.subject}</div>
                                            <div><strong>To:</strong> {testSendEmail || testSendPreview.leadEmail}</div>
                                        </div>
                                        <div className="max-h-[400px] overflow-y-auto bg-white">
                                            <iframe
                                                srcDoc={testSendPreview.htmlContent}
                                                className="w-full border-0"
                                                style={{ minHeight: '300px', height: 'auto' }}
                                                title="Email Preview"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 border rounded-lg bg-gray-50 text-sm text-gray-500">
                                        Click "Send Test" to generate and send the email preview.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-2" disabled={testSendSending} onClick={() => { setTestSendLead(null); setTestSendPreview(null); }}>
                            {String(t("close"))}
                        </Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>

            {/* Auth Information Dialog */}
            <Dialog open={!!authInfoLead} onOpenChange={() => setAuthInfoLead(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{String(t("authInformation"))}</DialogTitle>
                        <DialogDescription>
                            {String(t("authInformationDescription"))}
                        </DialogDescription>
                    </DialogHeader>
                    {authInfoLead && (
                        <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-muted-foreground">Company</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.company_name || ''}</div>
                                <div className="text-muted-foreground">Company Email</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.company_email || ''}</div>
                                <div className="text-muted-foreground">Owner</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.owner_name || ''}</div>
                                <div className="text-muted-foreground">Owner Email</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.owner_email || ''}</div>
                                <div className="text-muted-foreground">Manager</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.manager_name || ''}</div>
                                <div className="text-muted-foreground">Manager Email</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.manager_email || ''}</div>
                                <div className="text-muted-foreground">HR</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.hr_name || ''}</div>
                                <div className="text-muted-foreground">HR Email</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.hr_email || ''}</div>
                                <div className="text-muted-foreground">Executive</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.executive_name || ''}</div>
                                <div className="text-muted-foreground">Executive Email</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.executive_email || ''}</div>
                                <div className="text-muted-foreground">Company LinkedIn</div>
                                <div className="col-span-2 break-words">
                                    {authInfoLead.authInformation?.company_linkedin
                                        ? <a href={authInfoLead.authInformation.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{authInfoLead.authInformation.company_linkedin}</a>
                                        : ''}
                                </div>
                                <div className="text-muted-foreground">Role / Title</div>
                                <div className="col-span-2 break-words">{authInfoLead.authInformation?.role || ''}</div>
                                <div className="text-muted-foreground">Interest Keywords</div>
                                <div className="col-span-2 break-words whitespace-pre-wrap text-xs">{authInfoLead.authInformation?.interest_keywords || ''}</div>
                            </div>
                        </div>
                    )}
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-2" onClick={() => setAuthInfoLead(null)}>
                            {String(t("close"))}
                        </Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isRecheckDialogOpen} onOpenChange={setIsRecheckDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {String(t("recheckEmailValidationTitle")).replace("{count}", String(selectedLeads.size))}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {String(t("recheckEmailValidationDescription"))}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <p>{String(t("recheckSelectedLeadsOnly"))}</p>
                        <p>{String(t("rerunValidationEvenIfChecked"))}</p>
                        <p>{String(t("batchesEveryThreeMinutes"))}</p>
                        <p>{String(t("runsInBackgroundAfterStart"))}</p>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>{String(t("cancel"))}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRecheckEmails} disabled={isRecheckingEmails}>
                            {isRecheckingEmails ? String(t("starting")) : String(t("continue"))}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isDeleteLeadsDialogOpen} onOpenChange={setIsDeleteLeadsDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {String(t("deleteSelectedLeadsTitle")).replace("{count}", String(selectedLeads.size))}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove the selected leads from your database.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <p>Deletes selected lead records permanently</p>
                        <p>Cannot be undone after confirmation</p>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteSelectedLeads} disabled={isDeletingLeads}>
                            {isDeletingLeads ? 'Deleting...' : 'Delete Leads'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isCleanInvalidDialogOpen} onOpenChange={setIsCleanInvalidDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Clean invalid emails?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will validate stored lead emails and remove leads marked invalid.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <p>Validates stored lead emails in batches</p>
                        <p>Deletes leads with invalid email addresses</p>
                        <p>This action cannot be undone</p>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={cleanInvalidEmails} disabled={isCleaningEmails}>
                            {isCleaningEmails ? 'Cleaning...' : 'Continue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isCleanDuplicatesDialogOpen} onOpenChange={setIsCleanDuplicatesDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Clean duplicate emails?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove newer duplicate leads and keep only the oldest record per email.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <p>Finds leads sharing the same email</p>
                        <p>Keeps the oldest lead record</p>
                        <p>Deletes newer duplicates permanently</p>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={cleanDuplicateEmails} disabled={isCleaningDuplicates}>
                            {isCleaningDuplicates ? 'Cleaning...' : 'Continue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Direct Send Email Dialog — send email to any lead from leads page */}
            <Dialog open={!!directSendLead} onOpenChange={(open) => { if (!directSendSending) { setDirectSendLead(null); setDirectSendPreview(null); } }}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-blue-500" />
                            Send Email to Lead
                        </DialogTitle>
                        <DialogDescription>
                            Send a personalized email directly to this lead. Works for new and existing leads.
                        </DialogDescription>
                    </DialogHeader>

                    {directSendLead && (
                        <div className="space-y-4">
                            {/* Lead info */}
                            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">{directSendLead.name}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="text-muted-foreground">{directSendLead.company}</span>
                                </div>
                                <div className="text-sm text-blue-600">
                                    {directSendRecipient === 'company' && (directSendLead.authInformation as any)?.company_email
                                        ? (directSendLead.authInformation as any).company_email
                                        : directSendLead.email}
                                </div>
                                {directSendLead.emailHistory && directSendLead.emailHistory.length > 0 && (
                                    <div className="text-xs text-amber-600 mt-1">
                                        ⚠️ This lead already has {directSendLead.emailHistory.length} email(s) in history.
                                        Status: {directSendLead.status}
                                    </div>
                                )}
                            </div>

                            {/* Template selector */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-sm font-medium mb-1.5 block">Email Template (Stage)</Label>
                                    <Select value={directSendStage} onValueChange={(v) => updateDirectSendPreview(v)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select template..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {emailTemplates.length > 0 ? (
                                                emailTemplates.map((tpl: any) => (
                                                    <SelectItem key={tpl.id} value={tpl.stage || tpl.id}>
                                                        {tpl.stage ? tpl.stage.replace(/_/g, ' ') : 'Template'} {tpl.subject ? `— ${tpl.subject.substring(0, 40)}` : ''}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="" disabled>No templates found</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium mb-1.5 block">Send To</Label>
                                    <Select value={directSendRecipient} onValueChange={(v: any) => setDirectSendRecipient(v)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="lead">Lead's email ({directSendLead.email})</SelectItem>
                                            {(directSendLead.authInformation as any)?.company_email && (
                                                <SelectItem value="company">Company email ({(directSendLead.authInformation as any).company_email})</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Email preview */}
                            {directSendLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-muted-foreground">Generating email preview...</span>
                                </div>
                            ) : directSendPreview ? (
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="bg-muted px-4 py-2 border-b">
                                        <div className="text-sm font-medium">
                                            Subject: {directSendPreview.subject}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            Template stage: {directSendPreview.templateStage}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 max-h-[300px] overflow-y-auto">
                                        <div
                                            className="text-sm text-gray-900 gmail-content"
                                            dangerouslySetInnerHTML={{ __html: directSendPreview.htmlContent }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    Select a template to preview the email
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => { setDirectSendLead(null); setDirectSendPreview(null); }}
                                    disabled={directSendSending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={sendDirectEmail}
                                    disabled={directSendSending || !directSendPreview}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {directSendSending ? (
                                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                                    ) : (
                                        <><Send className="h-4 w-4 mr-2" /> Send Email</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Lead Details Dialog — shows all lead info from database */}
            <Dialog open={!!detailsLead} onOpenChange={() => setDetailsLead(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-blue-500" />
                            Lead Details
                        </DialogTitle>
                        <DialogDescription>
                            Complete lead information from database
                        </DialogDescription>
                    </DialogHeader>
                    {detailsLead && (
                        <div className="space-y-4 text-sm">
                            {/* Basic Information */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Basic Information</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Name</div>
                                    <div className="col-span-2 break-words">{detailsLead.name || '-'}</div>
                                    <div className="text-muted-foreground">Company</div>
                                    <div className="col-span-2 break-words">{detailsLead.company || '-'}</div>
                                    <div className="text-muted-foreground">Company Owner</div>
                                    <div className="col-span-2 break-words">{detailsLead.companyOwner || '-'}</div>
                                    <div className="text-muted-foreground">Email</div>
                                    <div className="col-span-2 break-words">{detailsLead.email || '-'}</div>
                                    <div className="text-muted-foreground">Phone</div>
                                    <div className="col-span-2 break-words">{detailsLead.phone || '-'}</div>
                                    <div className="text-muted-foreground">Website</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.website ? (
                                            <a href={`https://${detailsLead.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                {detailsLead.website}
                                            </a>
                                        ) : '-'}
                                    </div>
                                    <div className="text-muted-foreground">LinkedIn</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.linkedinProfile ? (
                                            <a href={`https://${detailsLead.linkedinProfile}`} target="_blank" rel="noopener noreferrer" className="text-[#9c55dc] hover:underline">
                                                {detailsLead.linkedinProfile}
                                            </a>
                                        ) : '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Location & Search Info */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Location & Search Information</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Location</div>
                                    <div className="col-span-2 break-words">{detailsLead.location || '-'}</div>
                                    <div className="text-muted-foreground">Address</div>
                                    <div className="col-span-2 break-words">{detailsLead.address || '-'}</div>
                                    <div className="text-muted-foreground">Source</div>
                                    <div className="col-span-2 break-words">{detailsLead.source || '-'}</div>
                                    <div className="text-muted-foreground">Industry</div>
                                    <div className="col-span-2 break-words">{detailsLead.industry || '-'}</div>
                                    <div className="text-muted-foreground">Search Service</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.searchService || (detailsLead.tags && detailsLead.tags.length > 0 ? detailsLead.tags[0] : '-')}
                                    </div>
                                    <div className="text-muted-foreground">Search Location</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.searchLocation || (detailsLead.tags && detailsLead.tags.length > 1 ? detailsLead.tags[1] : '-')}
                                    </div>
                                    <div className="text-muted-foreground">Tags</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.tags && detailsLead.tags.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {detailsLead.tags.map((tag, i) => (
                                                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                                                ))}
                                            </div>
                                        ) : '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Rating & Reviews */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Rating & Reviews</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Rating</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.rating ? `${detailsLead.rating} ⭐` : '-'}
                                    </div>
                                    <div className="text-muted-foreground">Reviews</div>
                                    <div className="col-span-2 break-words">{detailsLead.reviews || '-'}</div>
                                    <div className="text-muted-foreground">Google Ads</div>
                                    <div className="col-span-2 break-words">{detailsLead.googleAds ? 'Yes' : 'No'}</div>
                                    <div className="text-muted-foreground">Organic Ranking</div>
                                    <div className="col-span-2 break-words">{detailsLead.organicRanking || '-'}</div>
                                    <div className="text-muted-foreground">High Value</div>
                                    <div className="col-span-2 break-words">{detailsLead.isHighValue ? 'Yes' : 'No'}</div>
                                </div>
                            </div>

                            {/* Email Automation */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Email Automation</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Status</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailStatus || '-'}</div>
                                    <div className="text-muted-foreground">Stage</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailSequenceStage || detailsLead.stage || '-'}</div>
                                    <div className="text-muted-foreground">Sequence Active</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailSequenceActive ? 'Yes' : 'No'}</div>
                                    <div className="text-muted-foreground">Sequence Step</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailSequenceStep || '-'}</div>
                                    <div className="text-muted-foreground">Next Scheduled</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.nextScheduledEmail ? new Date(detailsLead.nextScheduledEmail).toLocaleString() : '-'}
                                    </div>
                                    <div className="text-muted-foreground">Last Emailed</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.lastEmailedAt ? new Date(detailsLead.lastEmailedAt).toLocaleString() : '-'}
                                    </div>
                                    <div className="text-muted-foreground">Retry Count</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailRetryCount || 0}</div>
                                    <div className="text-muted-foreground">Failure Count</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailFailureCount || 0}</div>
                                    <div className="text-muted-foreground">Stopped Reason</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailStoppedReason || '-'}</div>
                                    {detailsLead.emailOpenStats && detailsLead.emailOpenStats.totalSent > 0 && (
                                        <>
                                            <div className="text-muted-foreground">Email Opens</div>
                                            <div className="col-span-2 break-words">
                                                {detailsLead.emailOpenStats.totalOpened} / {detailsLead.emailOpenStats.totalSent} opened
                                                {detailsLead.emailOpenStats.lastOpenedAt && (
                                                    <span className="text-muted-foreground ml-2">
                                                        (last: {new Date(detailsLead.emailOpenStats.lastOpenedAt).toLocaleString()})
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Email Validation */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Email Validation</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Status</div>
                                    <div className="col-span-2 break-words">{detailsLead.emailValidationStatus || '-'}</div>
                                    <div className="text-muted-foreground">Checked At</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.emailValidationCheckedAt ? new Date(detailsLead.emailValidationCheckedAt).toLocaleString() : '-'}
                                    </div>
                                    {detailsLead.emailValidationDetails && (
                                        <>
                                            <div className="text-muted-foreground">Deliverable</div>
                                            <div className="col-span-2 break-words">{detailsLead.emailValidationDetails.isDeliverable ? 'Yes' : 'No'}</div>
                                            <div className="text-muted-foreground">Free Email</div>
                                            <div className="col-span-2 break-words">{detailsLead.emailValidationDetails.isFreeEmail ? 'Yes' : 'No'}</div>
                                            <div className="text-muted-foreground">Reason</div>
                                            <div className="col-span-2 break-words">{detailsLead.emailValidationDetails.reason || '-'}</div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Auth Information */}
                            {detailsLead.authInformation && (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm border-b pb-1">Auth / Executive Information</h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-muted-foreground">Company Name</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.company_name || '-'}</div>
                                        <div className="text-muted-foreground">Company Email</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.company_email || '-'}</div>
                                        <div className="text-muted-foreground">Owner</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.owner_name || '-'}</div>
                                        <div className="text-muted-foreground">Owner Email</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.owner_email || '-'}</div>
                                        <div className="text-muted-foreground">Manager</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.manager_name || '-'}</div>
                                        <div className="text-muted-foreground">Manager Email</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.manager_email || '-'}</div>
                                        <div className="text-muted-foreground">Executive</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.executive_name || '-'}</div>
                                        <div className="text-muted-foreground">Executive Email</div>
                                        <div className="col-span-2 break-words">{detailsLead.authInformation.executive_email || '-'}</div>
                                    </div>
                                </div>
                            )}

                            {/* Outreach Config */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Outreach Configuration</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Recipient</div>
                                    <div className="col-span-2 break-words">{detailsLead.outreachRecipient || 'lead'}</div>
                                    <div className="text-muted-foreground">Sender Identity</div>
                                    <div className="col-span-2 break-words">{detailsLead.senderIdentity || 'company'}</div>
                                </div>
                            </div>

                            {/* Notes */}
                            {detailsLead.notes && (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm border-b pb-1">Notes</h4>
                                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{detailsLead.notes}</div>
                                </div>
                            )}

                            {/* Metadata */}
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">Metadata</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-muted-foreground">Lead ID</div>
                                    <div className="col-span-2 break-words text-xs font-mono">{detailsLead.id || detailsLead._id}</div>
                                    <div className="text-muted-foreground">Created</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.createdAt ? new Date(detailsLead.createdAt).toLocaleString() : '-'}
                                    </div>
                                    <div className="text-muted-foreground">Updated</div>
                                    <div className="col-span-2 break-words">
                                        {detailsLead.updatedAt ? new Date(detailsLead.updatedAt).toLocaleString() : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogClose asChild>
                        <Button variant="outline" className="mt-2" onClick={() => setDetailsLead(null)}>
                            {String(t("close"))}
                        </Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default LeadsCollection;
