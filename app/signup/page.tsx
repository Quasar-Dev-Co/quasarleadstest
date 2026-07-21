"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Building,
  Globe,
  Shield,
  ArrowRight,
  KeyRound,
  RefreshCw,
  CheckCircle
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";

interface SignupForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<SignupForm>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Email verification state
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");

  const handleInputChange = (field: keyof SignupForm, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (formData.username.length < 3) {
      toast.error("Username must be at least 3 characters long");
      return;
    }

    if (!formData.email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const result = await auth.signup(formData.username, formData.email, formData.password);

      if (result.success) {
        setVerifiedEmail(formData.email);
        if (result.verificationEmailSent === false) {
          toast.warning("Account created, but the verification email could not be sent. Click resend to try again.");
        } else {
          toast.success("Account created! A verification code has been sent to your email.");
        }
        // Transition to verification step
        setVerificationStep(true);
      } else {
        toast.error(result.error || "Signup failed. Please try again.");
      }
      
    } catch (error) {
      toast.error("Signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle verification code submission
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationCode.trim()) {
      toast.error("Please enter the verification code");
      return;
    }

    if (verificationCode.trim().length !== 6) {
      toast.error("Verification code must be 6 digits");
      return;
    }

    setIsVerifying(true);
    try {
      const result = await auth.verifyEmail(verifiedEmail, verificationCode.trim());

      if (result.success) {
        toast.success(result.message || "Email verified successfully! You can now log in.");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else {
        toast.error(result.error || "Verification failed. Please try again.");
      }
    } catch (error) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle resend verification code
  const handleResendCode = async () => {
    setIsResending(true);
    try {
      const result = await auth.resendVerificationCode(verifiedEmail);

      if (result.success) {
        toast.success(result.message || "A new verification code has been sent to your email.");
        setVerificationCode("");
      } else {
        toast.error(result.error || "Failed to resend code. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl mb-4">
            <Image 
              src="/quasaralogo.png" 
              alt="QuasarLeads Logo" 
              width={80} 
              height={80} 
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">QuasarLeads</h1>
          <p className="text-slate-300 text-sm">AI-Powered Lead Generation Platform</p>
        </div>

        {/* Signup Card */}
        <Card className="bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold text-white mb-2">
              Create Account
            </CardTitle>
            <CardDescription className="text-slate-300">
              Join us and start generating leads with AI
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Verification Code Step */}
            {verificationStep ? (
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-2">
                    <CheckCircle className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Verify Your Email</h3>
                  <p className="text-slate-300 text-sm">
                    We sent a 6-digit code to <span className="text-purple-400 font-medium">{verifiedEmail}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verificationCode" className="text-white text-sm font-medium">
                    Verification Code
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="verificationCode"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                      className="pl-10 text-center text-2xl tracking-[0.5em] bg-white/10 border-white/20 text-white placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm focus:border-purple-400 focus:ring-purple-400"
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isVerifying || verificationCode.length !== 6}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium py-3 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifying ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span>Verify Email</span>
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep(false);
                      setVerificationCode("");
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    ← Back to signup
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isResending}
                    className="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    {isResending ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-400"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        <span>Resend code</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-white text-sm font-medium">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={formData.username}
                    onChange={(e) => handleInputChange("username", e.target.value)}
                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-purple-400"
                    required
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-purple-400"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-purple-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-white text-sm font-medium">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-purple-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-medium py-3 transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating account...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>Create Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </form>
            )}

            {/* Sign In Link - only show on signup step */}
            {!verificationStep && (
            <div className="text-center">
              <Separator className="my-4 bg-white/20" />
              <p className="text-slate-300 text-sm">
                Already have an account?{" "}
                <button
                  onClick={() => router.push("/login")}
                  className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
                >
                  Sign in here
                </button>
              </p>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 