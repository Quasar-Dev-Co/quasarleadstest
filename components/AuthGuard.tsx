"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure we're on the client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Only run auth check after component is mounted (client-side only)
    if (!isMounted) return;

    const checkAuth = async () => {
      const isAuthenticated = auth.isAuthenticated();
      const isLoginPage = pathname === "/login";
      const isSignupPage = pathname === "/signup";
      const isPublicPage = isLoginPage || isSignupPage;

      if (!isAuthenticated && !isPublicPage) {
        // Not authenticated and not on public pages - redirect to login
        router.push("/login");
        return;
      } else if (isAuthenticated && isPublicPage) {
        // Authenticated and on public pages - redirect to dashboard
        router.push("/");
        return;
      } else if (isAuthenticated && !isPublicPage) {
        // Verify user exists in database
        try {
          const user = await auth.getCurrentUserFromDB();
          if (!user) {
            // User was logged out by getCurrentUserFromDB (not found in DB)
            // Redirect will happen automatically
            return;
          }
        } catch (error) {
          console.error('Error verifying user:', error);
        }
      }
      
      // Valid state - show content
      setIsLoading(false);
    };

    checkAuth();
  }, [pathname, router, isMounted]);

  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return <>{children}</>;
} 