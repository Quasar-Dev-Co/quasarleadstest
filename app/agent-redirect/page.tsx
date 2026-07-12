"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/auth";

export default function AgentRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleRedirect = async () => {
      const returnUrl = searchParams.get('returnUrl');
      
      if (!returnUrl) {
        router.push('/login');
        return;
      }

      // Check if user is authenticated
      if (!auth.isAuthenticated()) {
        // Redirect to login with return path
        router.push(`/login?redirect=${encodeURIComponent(window.location.href)}`);
        return;
      }

      // Get user ID from session
      const userId = await auth.getCurrentUserId();
      
      if (!userId) {
        router.push('/login');
        return;
      }

      // Redirect to agent-login API with userId
      window.location.href = `/api/auth/agent-login?returnUrl=${encodeURIComponent(returnUrl)}&userId=${userId}`;
    };

    handleRedirect();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white text-lg">Redirecting to Agent System...</p>
      </div>
    </div>
  );
}
