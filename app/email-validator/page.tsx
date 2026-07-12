"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Mail, ShieldCheck, ShieldAlert, ShieldX, Server, Globe, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/auth";

type ValidatorResult = {
  success: boolean;
  email: string;
  validFormat: boolean;
  domainExists: boolean;
  mxFound: boolean;
  disposable: boolean;
  role: boolean;
  disposablePass: boolean;
  rolePass: boolean;
  deliverable: boolean;
  score: number;
  smtpCheck: boolean;
  catchAll: boolean;
  catchAllPass: boolean;
  mailboxExistsProbable: boolean;
  details: {
    domain: string;
    mxHosts: string[];
    smtp: {
      outcome: "deliverable" | "undeliverable" | "inconclusive";
      code?: number;
      stage: string;
      reason: string;
      host?: string;
    };
    note: string;
  };
  error?: string;
};

const CheckItem = ({
  label,
  pass,
  positiveLabel = "Pass",
  negativeLabel = "Fail",
}: {
  label: string;
  pass: boolean;
  positiveLabel?: string;
  negativeLabel?: string;
}) => {
  const visual = pass
    ? { cls: "text-green-600 bg-green-50 border-green-200", text: positiveLabel }
    : { cls: "text-red-600 bg-red-50 border-red-200", text: negativeLabel };

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <Badge className={visual.cls}>{visual.text}</Badge>
    </div>
  );
};

export default function EmailValidatorPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidatorResult | null>(null);

  const scoreTone = useMemo(() => {
    if (!result) return "bg-gray-200";
    if (result.score >= 85) return "bg-green-500";
    if (result.score >= 70) return "bg-yellow-500";
    return "bg-red-500";
  }, [result]);

  const onValidate = async () => {
    if (!email.trim()) {
      toast.error("Please enter an email");
      return;
    }

    setLoading(true);
    try {
      const userId = await auth.getCurrentUserId();
      if (!userId) {
        throw new Error("Please login to validate email");
      }

      const response = await fetch("/api/email-validator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || "Validation failed");
      }

      setResult(data);
      toast.success("Email validation complete");
    } catch (error: any) {
      setResult(null);
      toast.error(error?.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="border border-purple-500/30 bg-gradient-to-r from-[#1d0f39] via-[#24124a] to-[#160d31] text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl text-white">
              <Sparkles className="h-6 w-6 text-fuchsia-300" />
              Email Validator (Strict Pass/Fail)
            </CardTitle>
            <CardDescription className="text-purple-100">
              Enter an email and validate. Final status uses 4 checks only: format, domain, MX, and SMTP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-purple-200" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email (e.g. john@company.com)"
                    className="h-11 border-white/20 bg-white/10 pl-9 text-white placeholder:text-purple-200 focus-visible:ring-fuchsia-300"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onValidate();
                    }}
                  />
                </div>
                <Button onClick={onValidate} disabled={loading} className="h-11 md:min-w-44 bg-fuchsia-500 text-white hover:bg-fuchsia-400">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    "Validate Email"
                  )}
                </Button>
              </div>
              <p className="mt-3 text-xs text-purple-200">
                Rule: Pass all 4 core checks → Deliverable Pass. Any core check fails → Deliverable Fail.
              </p>
            </div>
          </CardContent>
        </Card>

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {result.deliverable ? (
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                  )}
                  Validation Summary
                </CardTitle>
                <CardDescription>{result.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Final Deliverable Status</span>
                    <Badge className={result.deliverable ? "bg-green-600 text-white" : "bg-red-600 text-white"}>
                      {result.deliverable ? "Pass" : "Fail"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Deliverability Score</span>
                    <span className="font-semibold">{result.score}/100</span>
                  </div>
                  <Progress value={result.score} className={scoreTone} />
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <CheckItem label="Valid Email Format" pass={result.validFormat} />
                  <CheckItem label="Domain Exists" pass={result.domainExists} />
                  <CheckItem label="MX Record Found" pass={result.mxFound} />
                  <CheckItem label="SMTP Validation" pass={result.smtpCheck} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-600" />
                  SMTP & DNS Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  <span>Domain: {result.details.domain || "-"}</span>
                </div>

                <div>
                  <div className="mb-1 font-medium">MX Hosts</div>
                  {result.details.mxHosts.length > 0 ? (
                    <div className="space-y-1">
                      {result.details.mxHosts.map((host) => (
                        <div key={host} className="rounded border bg-muted/30 px-2 py-1 text-xs">
                          {host}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No MX host available</div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">SMTP Outcome</div>
                    <div className="font-medium">{result.details.smtp.outcome}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">SMTP Code</div>
                    <div className="font-medium">{result.details.smtp.code ?? "N/A"}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">SMTP Stage</div>
                    <div className="font-medium">{result.details.smtp.stage}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">Reason</div>
                    <div className="font-medium break-all">{result.details.smtp.reason}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="mb-1 flex items-center gap-1 font-semibold">
                    <ShieldX className="h-4 w-4" />
                    Strict Validation Mode
                  </div>
                  <p>{result.details.note}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
