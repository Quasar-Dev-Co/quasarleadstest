"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { auth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  User,
  Shield,
  Users,
  Settings,
  Save,
  CheckCircle,
  XCircle,
  RefreshCw,
  Key,
  Server,
  Send,
  Plus,
  Trash2
} from "lucide-react";
import { useTranslations } from '@/hooks/use-translations';

interface User {
  id?: string;
  _id: string;
  username: string;
  email: string;
  verified: boolean;
  admin: boolean;
  createdAt: string;
}

interface AccountForm {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface SmtpAccount {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
}

interface ImapAccount {
  IMAP_HOST: string;
  IMAP_PORT: string;
  IMAP_USER: string;
  IMAP_PASSWORD: string;
}

const createEmptySmtpAccount = (): SmtpAccount => ({
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
});

const normalizeSmtpAccount = (raw: any): SmtpAccount => ({
  SMTP_HOST: String(raw?.SMTP_HOST ?? raw?.host ?? ""),
  SMTP_PORT: String(raw?.SMTP_PORT ?? raw?.port ?? ""),
  SMTP_USER: String(raw?.SMTP_USER ?? raw?.user ?? ""),
  SMTP_PASSWORD: String(raw?.SMTP_PASSWORD ?? raw?.password ?? ""),
});

const createEmptyImapAccount = (): ImapAccount => ({
  IMAP_HOST: "",
  IMAP_PORT: "",
  IMAP_USER: "",
  IMAP_PASSWORD: "",
});

const normalizeImapAccount = (raw: any): ImapAccount => ({
  IMAP_HOST: String(raw?.IMAP_HOST ?? raw?.host ?? ""),
  IMAP_PORT: String(raw?.IMAP_PORT ?? raw?.port ?? ""),
  IMAP_USER: String(raw?.IMAP_USER ?? raw?.user ?? ""),
  IMAP_PASSWORD: String(raw?.IMAP_PASSWORD ?? raw?.password ?? ""),
});

const parseApiKeyAccounts = (rawList: any, fallbackValue: string): string[] => {
  if (!Array.isArray(rawList)) {
    return [String(fallbackValue || "")];
  }

  const parsed = rawList
    .map((item: any) => {
      if (typeof item === 'string') return item;
      if (typeof item?.apiKey === 'string') return item.apiKey;
      if (typeof item?.key === 'string') return item.key;
      if (typeof item?.value === 'string') return item.value;
      if (typeof item?.SERPAPI_KEY === 'string') return item.SERPAPI_KEY;
      if (typeof item?.OPENAI_API_KEY === 'string') return item.OPENAI_API_KEY;
      return '';
    });

  return parsed.length > 0 ? parsed : [String(fallbackValue || "")];
};

const SMTP_DAILY_LIMIT_PER_ACCOUNT = 100;

const getConfiguredSmtpAccountsCount = (accounts: SmtpAccount[]): number => {
  const unique = new Set<string>();

  for (const account of accounts) {
    const host = account.SMTP_HOST.trim();
    const port = account.SMTP_PORT.trim();
    const user = account.SMTP_USER.trim();
    const password = account.SMTP_PASSWORD.trim();

    const isComplete = !!host && !!port && !!user && !!password;
    if (!isComplete) continue;

    unique.add(`${host}|${port}|${user}|${password}`);
  }

  return unique.size;
};

export default function AccountSettingsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Credentials state
  const [credentials, setCredentials] = useState({
    SERPAPI_KEY: "",
    OPENAI_API_KEY: "",
    APIFY_TOKEN: "",
    APIFY_EMAIL_VERIFIER_ACTOR_ID: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    IMAP_HOST: "",
    IMAP_PORT: "",
    IMAP_USER: "",
    IMAP_PASSWORD: "",
    ZOOM_EMAIL: "",
    ZOOM_PASSWORD: "",
    ZOOM_ACCOUNT_ID: "",
    ZOOM_CLIENT_ID: "",
    ZOOM_CLIENT_SECRET: "",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "",
    GOOGLE_CALENDAR_ID: "",
  });
  const [serpApiAccounts, setSerpApiAccounts] = useState<string[]>([""]);
  const [openAiAccounts, setOpenAiAccounts] = useState<string[]>([""]);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([createEmptySmtpAccount()]);
  const [imapAccounts, setImapAccounts] = useState<ImapAccount[]>([createEmptyImapAccount()]);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  
  // SMTP Testing state
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestStatus, setSmtpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [smtpTestError, setSmtpTestError] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [smtpSentToday, setSmtpSentToday] = useState(0);
  const [loadingSmtpUsage, setLoadingSmtpUsage] = useState(false);

  const [emailForm, setEmailForm] = useState({
    email: "",
    password: ""
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const { t, currentLanguage } = useTranslations();
  const tf = (key: keyof ReturnType<typeof useTranslations>['t'] extends (arg: infer K) => any ? K : string, values?: Record<string, string | number>) => {
    let text = String(t(key as any));
    if (!values) return text;
    Object.entries(values).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, String(value));
    });
    return text;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = await auth.getCurrentUserFromDB();
        if (!user) {
          toast.error(String(t('pleaseLoginToAccessAccountSettings')));
          router.push("/login");
          return;
        }
        setCurrentUser(user);

        if (user.admin) {
          fetchUsers();
        }
        // Load credentials for all users, not just admins
        // Load credentials and SMTP usage for all users, not just admins.
        await Promise.all([loadCredentials(), loadSmtpDailyUsage()]);
      } catch (error) {
        console.error('Error fetching user data:', error);
        toast.error(String(t('failedToLoadUserData')));
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      
      if (response.ok) {
        const normalizedUsers = Array.isArray(data.users)
          ? data.users.map((user: any) => ({
              ...user,
              _id: user._id || user.id || '',
            }))
          : [];
        setUsers(normalizedUsers);
      } else {
        toast.error(String(t('failedToFetchUsers')));
      }
    } catch (error) {
      toast.error(String(t('failedToFetchUsers')));
    }
  };

  const hydrateMultiCredentialState = (rawCreds: any) => {
    const serpList = parseApiKeyAccounts(rawCreds?.SERPAPI_ACCOUNTS, rawCreds?.SERPAPI_KEY || '');
    const openAiList = parseApiKeyAccounts(rawCreds?.OPENAI_ACCOUNTS, rawCreds?.OPENAI_API_KEY || '');

    let smtpList: SmtpAccount[] = [];
    if (Array.isArray(rawCreds?.SMTP_ACCOUNTS) && rawCreds.SMTP_ACCOUNTS.length > 0) {
      smtpList = rawCreds.SMTP_ACCOUNTS.map((item: any) => normalizeSmtpAccount(item));
    } else {
      smtpList = [normalizeSmtpAccount(rawCreds || {})];
    }

    let imapList: ImapAccount[] = [];
    if (Array.isArray(rawCreds?.IMAP_ACCOUNTS) && rawCreds.IMAP_ACCOUNTS.length > 0) {
      imapList = rawCreds.IMAP_ACCOUNTS.map((item: any) => normalizeImapAccount(item));
    } else {
      imapList = [normalizeImapAccount(rawCreds || {})];
    }

    setSerpApiAccounts(serpList.length > 0 ? serpList : ['']);
    setOpenAiAccounts([openAiList[0] || '']);
    setSmtpAccounts(smtpList.length > 0 ? smtpList : [createEmptySmtpAccount()]);
    setImapAccounts(imapList.length > 0 ? imapList : [createEmptyImapAccount()]);
  };

  const buildCredentialsPayload = () => {
    const normalizedSerp = serpApiAccounts.map((key) => key.trim()).filter(Boolean);
    const normalizedOpenAiPrimary = (openAiAccounts[0] || '').trim();
    const normalizedSmtp = smtpAccounts
      .map((account) => ({
        SMTP_HOST: account.SMTP_HOST.trim(),
        SMTP_PORT: account.SMTP_PORT.trim(),
        SMTP_USER: account.SMTP_USER.trim(),
        SMTP_PASSWORD: account.SMTP_PASSWORD.trim(),
      }))
      .filter((account) => account.SMTP_HOST || account.SMTP_PORT || account.SMTP_USER || account.SMTP_PASSWORD);

    const normalizedImap = imapAccounts
      .map((account) => ({
        IMAP_HOST: account.IMAP_HOST.trim(),
        IMAP_PORT: account.IMAP_PORT.trim(),
        IMAP_USER: account.IMAP_USER.trim(),
        IMAP_PASSWORD: account.IMAP_PASSWORD.trim(),
      }))
      .filter((account) => account.IMAP_HOST || account.IMAP_PORT || account.IMAP_USER || account.IMAP_PASSWORD);

    const primarySmtp = normalizedSmtp[0] || createEmptySmtpAccount();
    const primaryImap = normalizedImap[0] || createEmptyImapAccount();

    return {
      ...credentials,
      SERPAPI_ACCOUNTS: normalizedSerp,
      OPENAI_ACCOUNTS: normalizedOpenAiPrimary ? [normalizedOpenAiPrimary] : [],
      SMTP_ACCOUNTS: normalizedSmtp,
      IMAP_ACCOUNTS: normalizedImap,
      SERPAPI_KEY: normalizedSerp[0] || '',
      OPENAI_API_KEY: normalizedOpenAiPrimary,
      SMTP_HOST: primarySmtp.SMTP_HOST,
      SMTP_PORT: primarySmtp.SMTP_PORT,
      SMTP_USER: primarySmtp.SMTP_USER,
      SMTP_PASSWORD: primarySmtp.SMTP_PASSWORD,
      IMAP_HOST: primaryImap.IMAP_HOST,
      IMAP_PORT: primaryImap.IMAP_PORT,
      IMAP_USER: primaryImap.IMAP_USER,
      IMAP_PASSWORD: primaryImap.IMAP_PASSWORD,
    };
  };

  useEffect(() => {
    const primarySmtp = smtpAccounts[0] || createEmptySmtpAccount();
    const primaryImap = imapAccounts[0] || createEmptyImapAccount();
    setCredentials((prev) => ({
      ...prev,
      SERPAPI_KEY: (serpApiAccounts[0] || '').trim(),
      OPENAI_API_KEY: (openAiAccounts[0] || '').trim(),
      SMTP_HOST: primarySmtp.SMTP_HOST,
      SMTP_PORT: primarySmtp.SMTP_PORT,
      SMTP_USER: primarySmtp.SMTP_USER,
      SMTP_PASSWORD: primarySmtp.SMTP_PASSWORD,
      IMAP_HOST: primaryImap.IMAP_HOST,
      IMAP_PORT: primaryImap.IMAP_PORT,
      IMAP_USER: primaryImap.IMAP_USER,
      IMAP_PASSWORD: primaryImap.IMAP_PASSWORD,
    }));
  }, [serpApiAccounts, openAiAccounts, smtpAccounts, imapAccounts]);

  const loadCredentials = async () => {
    try {
      setLoadingCredentials(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/credentials', {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const merged = { ...credentials, ...(data.credentials || {}) };
        setCredentials(merged);
        hydrateMultiCredentialState(merged);
      } else {
        toast.error(data.error || String(t('failedToLoadCredentials')));
      }
    } catch (err) {
      toast.error(String(t('failedToLoadCredentials')));
    } finally {
      setLoadingCredentials(false);
    }
  };

  const loadSmtpDailyUsage = async () => {
    try {
      setLoadingSmtpUsage(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/smtp-daily-capacity', {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpSentToday(Number(data?.data?.sentToday || 0));
      }
    } catch (error) {
      console.warn('Failed to load SMTP daily usage:', error);
    } finally {
      setLoadingSmtpUsage(false);
    }
  };

  const saveCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSavingCredentials(true);
      const authHeader = auth.getAuthHeader();
      const payloadCredentials = buildCredentialsPayload();
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ credentials: payloadCredentials }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCredentials((prev) => ({ ...prev, ...payloadCredentials }));
        await loadSmtpDailyUsage();
        toast.success(String(t('credentialsSaved')));
      } else {
        toast.error(data.error || String(t('failedToSaveCredentials')));
      }
    } catch (err) {
      toast.error(String(t('failedToSaveCredentials')));
    } finally {
      setSavingCredentials(false);
    }
  };

  const configuredSmtpAccountsCount = getConfiguredSmtpAccountsCount(smtpAccounts);
  const smtpDailyCapacity = configuredSmtpAccountsCount * SMTP_DAILY_LIMIT_PER_ACCOUNT;
  const smtpRemainingToday = Math.max(smtpDailyCapacity - smtpSentToday, 0);
  const smtpUsagePercent = smtpDailyCapacity > 0
    ? Math.min(100, Math.round((smtpSentToday / smtpDailyCapacity) * 100))
    : 0;

  // Export credentials to JSON
  const exportCredentialsJSON = () => {
    const data = JSON.stringify(buildCredentialsPayload(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const filename = 'credentials-export.json';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(String(t('credentialsExportedAsJson')));
  };

  // Import credentials from JSON
  const onImportFile = async (file: File) => {
    try {
      setImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        toast.error(String(t('invalidJson')));
        return;
      }
      // Only accept known keys
      const allowedKeys = [
        'SERPAPI_KEY','OPENAI_API_KEY','APIFY_TOKEN','APIFY_EMAIL_VERIFIER_ACTOR_ID','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD',
        'IMAP_HOST','IMAP_PORT','IMAP_USER','IMAP_PASSWORD','ZOOM_EMAIL','ZOOM_PASSWORD',
        'ZOOM_ACCOUNT_ID','ZOOM_CLIENT_ID','ZOOM_CLIENT_SECRET',
        'SERPAPI_ACCOUNTS','OPENAI_ACCOUNTS','SMTP_ACCOUNTS','IMAP_ACCOUNTS',
        'GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY','GOOGLE_CALENDAR_ID'
      ];
      const nextCreds: any = { ...credentials };
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          const value = parsed[key];
          if (Array.isArray(value) || (value && typeof value === 'object')) {
            nextCreds[key] = value;
          } else {
            nextCreds[key] = String(value ?? '');
          }
        }
      }
      setCredentials(nextCreds);
      hydrateMultiCredentialState(nextCreds);
      toast.success(String(t('credentialsLoadedFromJson')));
    } catch (e: any) {
      toast.error(e?.message || String(t('failedToImportJson')));
    } finally {
      setImporting(false);
    }
  };

  // Test SMTP connection
  const testSmtpConnection = async () => {
    const primarySmtp = smtpAccounts[0] || createEmptySmtpAccount();

    // Validate SMTP settings
    if (!primarySmtp.SMTP_HOST || !primarySmtp.SMTP_PORT || !primarySmtp.SMTP_USER || !primarySmtp.SMTP_PASSWORD) {
      toast.error(String(t('pleaseFillAllSmtpFields')));
      return;
    }
    
    // If no test recipient provided, default to the SMTP user
    const emailRecipient = testRecipient.trim() || primarySmtp.SMTP_USER;

    setTestingSmtp(true);
    setSmtpTestStatus('testing');
    setSmtpTestError('');

    try {
      const response = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          smtpHost: primarySmtp.SMTP_HOST,
          smtpPort: primarySmtp.SMTP_PORT,
          smtpUser: primarySmtp.SMTP_USER,
          smtpPassword: primarySmtp.SMTP_PASSWORD,
          testRecipient: emailRecipient,
          saveCredentials: true
        })
      });

      const data = await response.json();

      if (data.success) {
        setSmtpTestStatus('success');
        toast.success(String(t('smtpConnectionSuccessful')));
      } else {
        setSmtpTestStatus('error');
        setSmtpTestError(data.error || String(t('failedToConnectToSmtpServer')));
        toast.error(tf('smtpTestFailed', { error: data.error }));
      }
    } catch (error: any) {
      setSmtpTestStatus('error');
      setSmtpTestError(error.message || String(t('error')));
      toast.error(tf('testSmtpError', { error: error.message || String(t('failedToTestSmtp')) }));
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchUsers();
      toast.success(String(t('userDataRefreshedSuccessfully')));
    } catch (error) {
      toast.error(String(t('failedToRefreshUserData')));
    } finally {
      setRefreshing(false);
    }
  };

  const verifyUser = async (userId: string, verified: boolean) => {
    if (!userId) {
      toast.error(String(t('userIdMissingForAccount')));
      return;
    }

    setVerifying(userId);
    
    try {
      const response = await fetch('/api/admin/verify-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId, 
          action: verified ? 'verify' : 'reject' 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        // Refresh the user list
        await fetchUsers();
      } else {
        toast.error(data.error || String(t('failedToUpdateUser')));
      }
    } catch (error) {
      toast.error(String(t('failedToUpdateUser')));
    } finally {
      setVerifying(null);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailForm.email || !emailForm.password) {
      toast.error(String(t('pleaseFillInAllFields')));
      return;
    }

    if (!emailForm.email.includes("@")) {
      toast.error(String(t('pleaseEnterValidEmailAddress')));
      return;
    }

    setUpdatingEmail(true);

    try {
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          newEmail: emailForm.email,
          currentPassword: emailForm.password,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(String(t('emailUpdatedSuccessfully')));
        auth.updateSessionEmail(emailForm.email);
        setCurrentUser((prev: any) => ({ ...prev, email: emailForm.email }));
        setEmailForm({ email: '', password: '' });
      } else {
        toast.error(data.error || String(t('failedToUpdateEmail')));
      }
    } catch (error) {
      toast.error(String(t('failedToUpdateEmail')));
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error(String(t('pleaseFillInAllFields')));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error(String(t('newPasswordMinLength')));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(String(t('newPasswordsDoNotMatch')));
      return;
    }

    setUpdatingPassword(true);

    try {
      const authHeader = auth.getAuthHeader();
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(String(t('passwordUpdatedSuccessfully')));
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast.error(data.error || String(t('failedToUpdatePassword')));
      }
    } catch (error) {
      toast.error(String(t('failedToUpdatePassword')));
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('accountSettings')}</h1>
          <p className="text-muted-foreground">{t('accountSettingsSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/credentials')}>
            {t('howToGetCredentials')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-4">
          <TabsTrigger value="profile">{t('profile')}</TabsTrigger>
          <TabsTrigger value="security">{t('security')}</TabsTrigger>
          {currentUser?.admin && (
            <TabsTrigger value="admin">{t('adminPanel')}</TabsTrigger>
          )}
          <TabsTrigger value="credentials">{t('credentials')}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('profileInformation')}
              </CardTitle>
              <CardDescription>
                {t('profileInformationDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">{t('usernameLabel')}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{currentUser?.username}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">{t('email')}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{currentUser?.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">{t('accountType')}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {currentUser?.admin && (
                      <Badge variant="secondary">{t('adminLabel')}</Badge>
                    )}
                    <Badge variant={currentUser?.verified ? "default" : "destructive"}>
                      {currentUser?.verified ? t('verifiedLabel') : t('unverifiedLabel')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">{t('memberSince')}</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString(currentLanguage === 'nl' ? 'nl-NL' : 'en-US') : ''}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          {/* Email Change */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t('changeEmail')}
              </CardTitle>
              <CardDescription>
                {t('changeEmailDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newEmail">{t('newEmailAddress')}</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    placeholder={t('newEmailAddress') as string}
                    value={emailForm.email}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailPassword">{t('currentPasswordLabel')}</Label>
                  <div className="relative">
                    <Input
                      id="emailPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder={t('currentPasswordLabel') as string}
                      value={emailForm.password}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={updatingEmail}>
                  {updatingEmail ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('loading')}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Save className="h-4 w-4" />
                      {t('updateEmail')}
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Separator />

          {/* Password Change */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t('changePassword')}
              </CardTitle>
              <CardDescription>
                {t('changePasswordDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t('currentPasswordLabel')}</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder={t('currentPasswordLabel') as string}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('newPasswordLabel')}</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      placeholder={t('newPasswordLabel') as string}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('confirmNewPasswordLabel')}</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder={t('confirmNewPasswordLabel') as string}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={updatingPassword}>
                  {updatingPassword ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('loading')}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {t('updatePassword')}
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

                 {currentUser?.admin && (
           <TabsContent value="admin" className="space-y-6">
             <Card>
               <CardHeader>
                 <div className="flex items-center justify-between">
                   <div>
                     <CardTitle className="flex items-center gap-2">
                       <Users className="h-5 w-5" />
                       {t('userManagement')}
                     </CardTitle>
                      <CardDescription>
                        {t('userManagementDescription')}
                      </CardDescription>
                   </div>
                   <Button
                     onClick={handleRefresh}
                     disabled={refreshing}
                     variant="outline"
                     size="sm"
                   >
                     {refreshing ? (
                       <div className="flex items-center gap-2">
                         <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('loading')}
                       </div>
                     ) : (
                       <div className="flex items-center gap-2">
                         <RefreshCw className="h-4 w-4" />
                          {t('refresh')}
                       </div>
                     )}
                   </Button>
                 </div>
               </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {users.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">{t('noUsersFound')}</p>
                  ) : (
                    users.map((user) => (
                      (() => {
                        const userId = user._id || user.id || '';
                        return (
                      <div
                        key={userId || user.email}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium">{user.username}</h3>
                            {user.admin && (
                              <Badge variant="secondary">{t('adminLabel')}</Badge>
                            )}
                            <Badge variant={user.verified ? "default" : "destructive"}>
                              {user.verified ? t('verifiedLabel') : t('unverifiedLabel')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                             {t('joined')}: {new Date(user.createdAt).toLocaleDateString(currentLanguage === 'nl' ? 'nl-NL' : 'en-US')}
                          </p>
                        </div>
                        
                        <div className="flex space-x-2">
                          {!user.verified ? (
                            <Button
                              size="sm"
                              onClick={() => verifyUser(userId, true)}
                              disabled={!userId || verifying === userId}
                            >
                              {verifying === userId ? (
                                <div className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                   {t('loading')}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-3 w-3" />
                                   {t('verify')}
                                </div>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifyUser(userId, false)}
                              disabled={!userId || verifying === userId}
                            >
                              {verifying === userId ? (
                                <div className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                                   {t('loading')}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3 w-3" />
                                   {t('unverify')}
                                </div>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                        );
                      })()
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="credentials" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('credentialsTitle')}
              </CardTitle>
              <CardDescription>
                {currentUser?.admin 
                  ? t('credentialsDescriptionAdmin')
                  : t('credentialsDescriptionUser')
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveCredentials} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>SERPAPI_KEY</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setSerpApiAccounts((prev) => [...prev, ''])}
                        title={String(t('addSerpApiAccount'))}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {serpApiAccounts.map((apiKey, index) => (
                      <div key={`serp-${index}`} className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showSecrets[`SERPAPI_KEY_${index}`] ? 'text' : 'password'}
                            placeholder={tf('serpApiKeyPlaceholder', { index: index + 1 })}
                            value={apiKey}
                            className="pr-10"
                            onChange={(e) => {
                              const next = [...serpApiAccounts];
                              next[index] = e.target.value;
                              setSerpApiAccounts(next);
                            }}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setShowSecrets({ ...showSecrets, [`SERPAPI_KEY_${index}`]: !showSecrets[`SERPAPI_KEY_${index}`] })}
                          >
                            {showSecrets[`SERPAPI_KEY_${index}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={serpApiAccounts.length === 1}
                          onClick={() => setSerpApiAccounts((prev) => prev.filter((_, i) => i !== index))}
                          title={String(t('removeSerpApiAccount'))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{t('firstAccountUsedAsPrimary')}</p>
                  </div>

                  <div className="space-y-3">
                    <Label>OPENAI_API_KEY</Label>
                    <div className="relative">
                      <Input
                        type={showSecrets.OPENAI_API_KEY ? 'text' : 'password'}
                        placeholder={String(t('openAiKeyPlaceholder'))}
                        value={openAiAccounts[0] || ''}
                        className="pr-10"
                        onChange={(e) => setOpenAiAccounts([e.target.value])}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onClick={() => setShowSecrets({ ...showSecrets, OPENAI_API_KEY: !showSecrets.OPENAI_API_KEY })}
                      >
                        {showSecrets.OPENAI_API_KEY ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('singleKeyOpenAiOnly')}</p>
                  </div>

                  <div className="space-y-3">
                    <Label>APIFY_TOKEN</Label>
                    <div className="relative">
                      <Input
                        type={showSecrets.APIFY_TOKEN ? 'text' : 'password'}
                        placeholder={String(t('apifyTokenPlaceholder'))}
                        value={credentials.APIFY_TOKEN}
                        className="pr-10"
                        onChange={(e) => setCredentials({ ...credentials, APIFY_TOKEN: e.target.value })}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        onClick={() => setShowSecrets({ ...showSecrets, APIFY_TOKEN: !showSecrets.APIFY_TOKEN })}
                      >
                        {showSecrets.APIFY_TOKEN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('apifyTokenUsageHelp')}</p>
                  </div>

                  <div className="space-y-3">
                    <Label>APIFY_EMAIL_VERIFIER_ACTOR_ID</Label>
                    <Input
                      value={credentials.APIFY_EMAIL_VERIFIER_ACTOR_ID}
                      placeholder={String(t('apifyEmailVerifierActorPlaceholder'))}
                      onChange={(e) => setCredentials({ ...credentials, APIFY_EMAIL_VERIFIER_ACTOR_ID: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">{t('apifyActorOptionalHelp')}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Server className="h-4 w-4" />
                      {t('smtpSettings')}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setSmtpAccounts((prev) => [...prev, createEmptySmtpAccount()])}
                      title={String(t('addSmtpAccount'))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="border border-border/60 rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{t('dailySmtpCapacity')}</p>
                      <Badge variant="secondary">{tf('emailsPerDayPerSmtp', { count: 100 })}</Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-md border border-border/60 p-3 bg-background">
                        <p className="text-xs text-muted-foreground">{t('configuredSmtpAccounts')}</p>
                        <p className="text-xl font-semibold mt-1">{configuredSmtpAccountsCount}</p>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 bg-background">
                        <p className="text-xs text-muted-foreground">{t('sentTodayLabel')}</p>
                        <p className="text-xl font-semibold mt-1">{smtpSentToday}</p>
                      </div>
                      <div className="rounded-md border border-border/60 p-3 bg-background">
                        <p className="text-xs text-muted-foreground">{t('remainingToday')}</p>
                        <p className="text-xl font-semibold mt-1">{smtpRemainingToday}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-2 w-full bg-border/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${smtpUsagePercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tf('emailsUsedToday', { sent: smtpSentToday, total: smtpDailyCapacity })}
                      </p>
                    </div>

                    {loadingSmtpUsage && (
                      <p className="text-xs text-muted-foreground">{t('refreshingSmtpUsage')}</p>
                    )}
                  </div>

                  <div className="space-y-4">
                    {smtpAccounts.map((account, index) => (
                      <div key={`smtp-${index}`} className="border border-border/60 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{tf('smtpAccountLabel', { index: index + 1 })}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={smtpAccounts.length === 1}
                            onClick={() => setSmtpAccounts((prev) => prev.filter((_, i) => i !== index))}
                            title={String(t('removeSmtpAccount'))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label htmlFor={`SMTP_HOST_${index}`}>SMTP_HOST</Label>
                            <Input
                              id={`SMTP_HOST_${index}`}
                              value={account.SMTP_HOST}
                              onChange={(e) => {
                                const next = [...smtpAccounts];
                                next[index] = { ...next[index], SMTP_HOST: e.target.value };
                                setSmtpAccounts(next);
                              }}
                              placeholder="smtp.example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`SMTP_PORT_${index}`}>SMTP_PORT</Label>
                            <Input
                              id={`SMTP_PORT_${index}`}
                              value={account.SMTP_PORT}
                              onChange={(e) => {
                                const next = [...smtpAccounts];
                                next[index] = { ...next[index], SMTP_PORT: e.target.value };
                                setSmtpAccounts(next);
                              }}
                              placeholder="587"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`SMTP_USER_${index}`}>SMTP_USER</Label>
                            <Input
                              id={`SMTP_USER_${index}`}
                              value={account.SMTP_USER}
                              onChange={(e) => {
                                const next = [...smtpAccounts];
                                next[index] = { ...next[index], SMTP_USER: e.target.value };
                                setSmtpAccounts(next);
                              }}
                              placeholder="user@example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`SMTP_PASSWORD_${index}`}>SMTP_PASSWORD</Label>
                            <div className="relative">
                              <Input
                                id={`SMTP_PASSWORD_${index}`}
                                type={showSecrets[`SMTP_PASSWORD_${index}`] ? 'text' : 'password'}
                                value={account.SMTP_PASSWORD}
                                onChange={(e) => {
                                  const next = [...smtpAccounts];
                                  next[index] = { ...next[index], SMTP_PASSWORD: e.target.value };
                                  setSmtpAccounts(next);
                                }}
                              />
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                onClick={() => setShowSecrets({ ...showSecrets, [`SMTP_PASSWORD_${index}`]: !showSecrets[`SMTP_PASSWORD_${index}`] })}
                              >
                                {showSecrets[`SMTP_PASSWORD_${index}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{t('firstSmtpPrimaryForSending')}</p>
                  </div>
                  
                  {/* SMTP Test Section */}
                  <div className="mt-4 border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Send className="h-4 w-4" />
                        {t('testSmtpConnection')}
                      </div>
                      <Button 
                        onClick={testSmtpConnection}
                        disabled={testingSmtp}
                        variant={smtpTestStatus === 'success' ? 'default' : 'outline'}
                        size="sm"
                      >
                        {testingSmtp ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                            {t('testing')}
                          </div>
                        ) : (
                          t('testSmtp')
                        )}
                      </Button>
                    </div>
                    
                    {/* Test Email Recipient Input */}
                    <div className="mt-3 mb-3">
                      <Label htmlFor="testEmailRecipient" className="text-xs text-muted-foreground mb-1 block">{t('sendTestEmailOptional')}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="testEmailRecipient"
                          type="email"
                          placeholder={String(t('recipientEmailPlaceholder'))}
                          value={testRecipient}
                          onChange={(e) => setTestRecipient(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t('leaveEmptyToSendToSmtpUsername')}</p>
                    </div>
                    
                    {smtpTestStatus === 'success' && (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/30 p-2 rounded border border-green-100 dark:border-green-900">
                        <CheckCircle className="h-4 w-4" />
                        {t('connectedTestEmailSent')}
                      </div>
                    )}
                    
                    {smtpTestStatus === 'error' && (
                      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/30 p-2 rounded border border-red-100 dark:border-red-900">
                        <XCircle className="h-4 w-4" />
                        {tf('notConnected', { error: smtpTestError })}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Server className="h-4 w-4" />
                    {t('googleCalendarServiceAccount')}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-1">
                      <Label htmlFor="GOOGLE_SERVICE_ACCOUNT_EMAIL">GOOGLE_SERVICE_ACCOUNT_EMAIL</Label>
                      <Input id="GOOGLE_SERVICE_ACCOUNT_EMAIL" value={credentials.GOOGLE_SERVICE_ACCOUNT_EMAIL} onChange={(e) => setCredentials({ ...credentials, GOOGLE_SERVICE_ACCOUNT_EMAIL: e.target.value })} placeholder="service-account@project.iam.gserviceaccount.com" />
                    </div>
                    <div className="space-y-2 md:col-span-1">
                      <Label htmlFor="GOOGLE_CALENDAR_ID">GOOGLE_CALENDAR_ID</Label>
                      <Input id="GOOGLE_CALENDAR_ID" value={credentials.GOOGLE_CALENDAR_ID} onChange={(e) => setCredentials({ ...credentials, GOOGLE_CALENDAR_ID: e.target.value })} placeholder="your-calendar-id@gmail.com" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</Label>
                      <div className="relative">
                        <Input
                          id="GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
                          type={showSecrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? 'text' : 'password'}
                          value={credentials.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY}
                          onChange={(e) => setCredentials({ ...credentials, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: e.target.value })}
                          placeholder="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowSecrets({ ...showSecrets, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: !showSecrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY })}
                        >
                          {showSecrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('googleCalendarAccessHelp')}</p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Server className="h-4 w-4" />
                      {t('imapSettings')}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setImapAccounts((prev) => [...prev, createEmptyImapAccount()])}
                      title="Add IMAP Account"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="border border-border/60 rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Configured IMAP Accounts</p>
                      <Badge variant="secondary">Reads replies from all</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All configured IMAP accounts will be checked for incoming reply emails. The system reads from every account simultaneously.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {imapAccounts.map((account, index) => (
                      <div key={`imap-${index}`} className="border border-border/60 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">IMAP Account {index + 1}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={imapAccounts.length === 1}
                            onClick={() => setImapAccounts((prev) => prev.filter((_, i) => i !== index))}
                            title="Remove IMAP Account"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label htmlFor={`IMAP_HOST_${index}`}>IMAP_HOST</Label>
                            <Input
                              id={`IMAP_HOST_${index}`}
                              value={account.IMAP_HOST}
                              onChange={(e) => {
                                const next = [...imapAccounts];
                                next[index] = { ...next[index], IMAP_HOST: e.target.value };
                                setImapAccounts(next);
                              }}
                              placeholder="imap.example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`IMAP_PORT_${index}`}>IMAP_PORT</Label>
                            <Input
                              id={`IMAP_PORT_${index}`}
                              value={account.IMAP_PORT}
                              onChange={(e) => {
                                const next = [...imapAccounts];
                                next[index] = { ...next[index], IMAP_PORT: e.target.value };
                                setImapAccounts(next);
                              }}
                              placeholder="993"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`IMAP_USER_${index}`}>IMAP_USER</Label>
                            <Input
                              id={`IMAP_USER_${index}`}
                              value={account.IMAP_USER}
                              onChange={(e) => {
                                const next = [...imapAccounts];
                                next[index] = { ...next[index], IMAP_USER: e.target.value };
                                setImapAccounts(next);
                              }}
                              placeholder="user@example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`IMAP_PASSWORD_${index}`}>IMAP_PASSWORD</Label>
                            <div className="relative">
                              <Input
                                id={`IMAP_PASSWORD_${index}`}
                                type={showSecrets[`IMAP_PASSWORD_${index}`] ? 'text' : 'password'}
                                value={account.IMAP_PASSWORD}
                                onChange={(e) => {
                                  const next = [...imapAccounts];
                                  next[index] = { ...next[index], IMAP_PASSWORD: e.target.value };
                                  setImapAccounts(next);
                                }}
                              />
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                onClick={() => setShowSecrets({ ...showSecrets, [`IMAP_PASSWORD_${index}`]: !showSecrets[`IMAP_PASSWORD_${index}`] })}
                              >
                                {showSecrets[`IMAP_PASSWORD_${index}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">All IMAP accounts are checked for incoming replies. Add one for each SMTP account you send from.</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    {t('zoomCredentials')}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="ZOOM_EMAIL">ZOOM_EMAIL</Label>
                      <Input id="ZOOM_EMAIL" value={credentials.ZOOM_EMAIL} onChange={(e) => setCredentials({ ...credentials, ZOOM_EMAIL: e.target.value })} placeholder="zoom-user@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ZOOM_PASSWORD">ZOOM_PASSWORD</Label>
                      <div className="relative">
                        <Input
                          id="ZOOM_PASSWORD"
                          type={showSecrets.ZOOM_PASSWORD ? 'text' : 'password'}
                          value={credentials.ZOOM_PASSWORD}
                          onChange={(e) => setCredentials({ ...credentials, ZOOM_PASSWORD: e.target.value })}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowSecrets({ ...showSecrets, ZOOM_PASSWORD: !showSecrets.ZOOM_PASSWORD })}
                        >
                          {showSecrets.ZOOM_PASSWORD ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ZOOM_ACCOUNT_ID">ZOOM_ACCOUNT_ID</Label>
                      <Input id="ZOOM_ACCOUNT_ID" value={credentials.ZOOM_ACCOUNT_ID} onChange={(e) => setCredentials({ ...credentials, ZOOM_ACCOUNT_ID: e.target.value })} placeholder="account id" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ZOOM_CLIENT_ID">ZOOM_CLIENT_ID</Label>
                      <Input id="ZOOM_CLIENT_ID" value={credentials.ZOOM_CLIENT_ID} onChange={(e) => setCredentials({ ...credentials, ZOOM_CLIENT_ID: e.target.value })} placeholder="client id" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ZOOM_CLIENT_SECRET">ZOOM_CLIENT_SECRET</Label>
                      <div className="relative">
                        <Input
                          id="ZOOM_CLIENT_SECRET"
                          type={showSecrets.ZOOM_CLIENT_SECRET ? 'text' : 'password'}
                          value={credentials.ZOOM_CLIENT_SECRET}
                          onChange={(e) => setCredentials({ ...credentials, ZOOM_CLIENT_SECRET: e.target.value })}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowSecrets({ ...showSecrets, ZOOM_CLIENT_SECRET: !showSecrets.ZOOM_CLIENT_SECRET })}
                        >
                          {showSecrets.ZOOM_CLIENT_SECRET ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={exportCredentialsJSON}>
                      {t('exportJson')}
                    </Button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onImportFile(file);
                        if (importInputRef.current) importInputRef.current.value = '';
                      }}
                    />
                    <Button type="button" variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()}>
                      {importing ? t('importingLabel') : t('importJson')}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={loadCredentials} disabled={loadingCredentials}>
                      {loadingCredentials ? t('loading') : t('reload')}
                    </Button>
                    <Button type="submit" disabled={savingCredentials}>
                      {savingCredentials ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          {t('savingLabel')}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Save className="h-4 w-4" />
                          {t('saveCredentialsLabel')}
                        </div>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 
