const BOUNCE_SENDER_PATTERNS = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^no-?reply@/i,
  /^noreply@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,
  /^mail-delivery@/i,
  /^maildelivery@/i,
  /^delivery@/i,
  /^bounces?@/i,
  /^bounce-@/i,
  /^auto-reply@/i,
  /^autoreply@/i,
  /^autoresponder@/i,
  /^out-of-office@/i,
  /^outofoffice@/i,
  /^vacation@/i,
  /^dmarc@/i,
  /^feedback@/i,
  /^abuse@/i,
  /^spam@/i,
  /^phishing@/i,
  /^security@/i,
  /^admin@.*\.(com|net|org)$/i,
  /^root@/i,
  /^system@/i,
  /^alerts?@/i,
  /^notification@/i,
  /^notifications@/i,
];

const BOUNCE_DOMAIN_PATTERNS = [
  /mailer-daemon\./i,
  /postmaster\./i,
  /mail-delivery-subsystem\./i,
  /bounces?\./i,
  /returns?\./i,
];

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /undeliverable/i,
  /delivery failure/i,
  /delivery has failed/i,
  /failure notice/i,
  /returned mail/i,
  /mail delivery failed/i,
  /permanent delivery failure/i,
  /auto-?repl(?:y|ies)/i,
  /out of office/i,
  /autoreply/i,
  /automatic reply/i,
  /vacation reply/i,
  /bounce/i,
  /could not be delivered/i,
  /message you sent was blocked/i,
  /spam notification/i,
  /quarantine notification/i,
  /DMARC.*fail/i,
  /authentication.*fail/i,
  /email delivery report/i,
];

const BOUNCE_CONTENT_PATTERNS = [
  /delivery status notification/i,
  /this is the mail delivery agent/i,
  /this message was created automatically by mail delivery software/i,
  /the following addresses had permanent delivery errors/i,
  /could not be delivered/i,
  /your message could not be delivered/i,
  /delivery to the following recipient failed/i,
  /this is an automatically generated delivery status notification/i,
  /action: failed/i,
  /status: 5\.\d+\.\d+/i,
  /Diagnostic-Code:/i,
  /X-Postfix/i,
  /Reporting-MTA:/i,
  /Received-From-MTA:/i,
  /Final-Recipient:/i,
  /Remote-MTA:/i,
];

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value));
}

export function isBounceEmail(params: {
  fromEmail: string;
  subject: string;
  content: string;
}): boolean {
  const { fromEmail, subject, content } = params;

  const senderLower = (fromEmail || '').toLowerCase().trim();
  const subjectLower = (subject || '').toLowerCase().trim();
  const contentLower = (content || '').toLowerCase().trim();

  if (matchesAnyPattern(senderLower, BOUNCE_SENDER_PATTERNS)) {
    return true;
  }

  const domain = senderLower.split('@')[1] || '';
  if (domain && matchesAnyPattern(domain, BOUNCE_DOMAIN_PATTERNS)) {
    return true;
  }

  if (subjectLower && matchesAnyPattern(subjectLower, BOUNCE_SUBJECT_PATTERNS)) {
    return true;
  }

  const contentToCheck = contentLower.slice(0, 2000);
  if (contentToCheck && matchesAnyPattern(contentToCheck, BOUNCE_CONTENT_PATTERNS)) {
    return true;
  }

  return false;
}

export function isAutoReply(params: {
  fromEmail: string;
  subject: string;
  content: string;
}): boolean {
  const { fromEmail, subject, content } = params;

  const senderLower = (fromEmail || '').toLowerCase().trim();
  const subjectLower = (subject || '').toLowerCase().trim();
  const contentLower = (content || '').toLowerCase().trim();

  const autoReplySenderPatterns = [
    /^auto-?reply@/i,
    /^autoreply@/i,
    /^autoresponder@/i,
    /^out-of-office@/i,
    /^outofoffice@/i,
    /^vacation@/i,
  ];

  const autoReplySubjectPatterns = [
    /out of office/i,
    /auto-?repl(?:y|ies)/i,
    /autoreply/i,
    /automatic reply/i,
    /vacation reply/i,
    /afwezig/i,
    /automatisch.*antwoord/i,
  ];

  const autoReplyContentPatterns = [
    /i am (currently )?out of the office/i,
    /i will be out of (the )?office/i,
    /i'm currently away/i,
    /i am currently away/i,
    /automatic reply/i,
    /auto-?generated message/i,
    /this is an automated response/i,
    /please do not reply to this automated email/i,
    /ik ben momenteel afwezig/i,
    /automatisch gegenereerd/i,
  ];

  if (matchesAnyPattern(senderLower, autoReplySenderPatterns)) return true;
  if (subjectLower && matchesAnyPattern(subjectLower, autoReplySubjectPatterns)) return true;

  const contentToCheck = contentLower.slice(0, 1000);
  if (contentToCheck && matchesAnyPattern(contentToCheck, autoReplyContentPatterns)) return true;

  return false;
}

export function shouldSkipEmail(params: {
  fromEmail: string;
  subject: string;
  content: string;
}): { skip: boolean; reason: string } {
  if (isBounceEmail(params)) {
    return { skip: true, reason: 'bounce_or_delivery_notification' };
  }

  if (isAutoReply(params)) {
    return { skip: true, reason: 'auto_reply_or_vacation' };
  }

  return { skip: false, reason: '' };
}
