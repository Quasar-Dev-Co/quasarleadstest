import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Quasar Leads LinkedIn Connector
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Last Updated: March 28, 2026
          </p>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 space-y-8">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              1. Introduction
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              Quasar Leads ("we", "our", or "us") provides a browser extension that allows users to connect their LinkedIn account to our platform for automation and lead management features. This Privacy Policy explains how we collect, use, and protect your information.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              2. Information We Collect
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              When you use our extension, we may collect the following data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
              <li>LinkedIn session cookies (such as authentication tokens like <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm">li_at</code>)</li>
              <li>Basic browser interaction data required to establish connection</li>
              <li>User account identifier linked to our platform</li>
            </ul>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mt-4">
              We do <strong>not</strong> collect your LinkedIn password, personal messages, or unrelated browsing data.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              3. How We Use Your Data
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              The collected data is used strictly for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
              <li>Connecting your LinkedIn account to our platform</li>
              <li>Maintaining an authenticated session for automation features</li>
              <li>Enabling features such as lead generation, outreach workflows, and account synchronization</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              4. User Consent
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              Data is only collected <strong>after explicit user action</strong>, such as clicking the "Connect LinkedIn" button.
              The extension does not collect any data silently or without user interaction.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              5. Data Storage and Security
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
              <li>Data is securely transmitted to our backend servers</li>
              <li>We use industry-standard security practices to protect stored data</li>
              <li>Access is restricted and monitored</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              6. Data Sharing
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              We do <strong>not</strong> sell, rent, or trade your data to third parties.
              Data is only used internally to provide our services.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              7. Third-Party Services
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              We may use trusted infrastructure providers (such as AWS) to securely store and process data.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              8. User Control
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              You can disconnect your LinkedIn account at any time by:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
              <li>Removing the extension</li>
              <li>Disconnecting via our platform dashboard</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              9. Compliance
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              We aim to comply with applicable data protection regulations including GDPR and similar frameworks where applicable.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              10. Updates to This Policy
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              We may update this Privacy Policy from time to time. Updates will be reflected on this page.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
              11. Contact Us
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              If you have any questions or concerns, please contact us at:{' '}
              <a 
                href="mailto:team.quasara@gmail.com" 
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                team.quasara@gmail.com
              </a>
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Quasar Leads. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
