#!/usr/bin/env python3
"""
DNS verification for codemypixel.com Brevo deliverability.
Checks that all corrected DNS records have propagated.

Usage:
    python3 verify_dns.py              # check all
    python3 verify_dns.py --watch      # re-check every 60s until all pass
"""

import subprocess
import sys
import time
import json
from datetime import datetime

DOMAIN = "codemypixel.com"

# Expected records: (subdomain, type, expected_substring)
EXPECTED = [
    # Root SPF - must be single, combined
    ("", "TXT", "v=spf1 include:_spf.mail.hostinger.com include:spf.sendinblue.com mx ~all"),
    # Root DMARC - relaxed alignment
    ("_dmarc", "TXT", "v=DMARC1; p=quarantine; pct=100; rua=mailto:admin@codemypixel.com,mailto:rua@dmarc.brevo.com; adkim=r; aspf=r"),
    # Root brevo-code
    ("", "TXT", "brevo-code:814bda306ec9718e370adf23234bdd29"),
    # Root DKIM CNAMEs
    ("brevo1._domainkey", "CNAME", "b1.codemypixel-com.dkim.brevo.com"),
    ("brevo2._domainkey", "CNAME", "b2.codemypixel-com.dkim.brevo.com"),

    # connect subdomain
    ("connect", "TXT", "v=spf1 include:spf.sendinblue.com include:spf.improvmx.com ~all"),
    ("connect", "TXT", "brevo-code:2c8e2bd4beaa32c33c204d67596ee79d"),
    ("_dmarc.connect", "TXT", "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"),
    ("brevo1._domainkey.connect", "CNAME", "b1.connect-codemypixel-com.dkim.brevo.com"),
    ("brevo2._domainkey.connect", "CNAME", "b2.connect-codemypixel-com.dkim.brevo.com"),

    # app subdomain
    ("app", "TXT", "v=spf1 include:spf.sendinblue.com include:spf.improvmx.com ~all"),
    ("app", "TXT", "brevo-code:6099db31e5371ce15459d7095d38c99c"),
    ("_dmarc.app", "TXT", "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"),
    ("brevo1._domainkey.app", "CNAME", "b1.app-codemypixel-com.dkim.brevo.com"),
    ("brevo2._domainkey.app", "CNAME", "b2.app-codemypixel-com.dkim.brevo.com"),

    # team subdomain
    ("team", "TXT", "v=spf1 include:spf.sendinblue.com include:spf.improvmx.com ~all"),
    ("team", "TXT", "brevo-code:7c0bc9619c65fed5ba74f570cb0a77dd"),
    ("_dmarc.team", "TXT", "v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com"),
    ("brevo1._domainkey.team", "CNAME", "b1.team-codemypixel-com.dkim.brevo.com"),
    ("brevo2._domainkey.team", "CNAME", "b2.team-codemypixel-com.dkim.brevo.com"),
]

# Things that should NOT exist anymore
FORBIDDEN = [
    ("", "TXT", "v=spf1 include:_spf.mail.hostinger.com ~all"),  # old standalone SPF
    ("", "TXT", "brevo-code:b2a35ecb946aeb2cf6511cbe3e929164"),  # duplicate brevo-code
    ("team", "TXT", "brevo-code:2c8e2bd4beaa32c33c204d67596ee79d"),  # duplicate team brevo-code
    ("_dmarc", "TXT", "adkim=s"),  # strict alignment should be gone
]


def dig(name, rtype):
    """Run dig and return list of record strings."""
    fqdn = f"{name}.{DOMAIN}" if name else DOMAIN
    try:
        result = subprocess.run(
            ["dig", "+short", rtype, fqdn, "@8.8.8.8"],
            capture_output=True, text=True, timeout=10
        )
        return [l.strip().strip('"') for l in result.stdout.strip().split("\n") if l.strip()]
    except subprocess.TimeoutExpired:
        return ["[TIMEOUT]"]
    except FileNotFoundError:
        print("ERROR: dig not installed. Install with: brew install bind")
        sys.exit(1)


def check_all():
    passed = 0
    failed = 0
    warnings = 0
    results = []

    print(f"\n{'='*70}")
    print(f"DNS Verification for {DOMAIN}")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Resolver: 8.8.8.8 (Google)")
    print(f"{'='*70}\n")

    # Check expected records
    for name, rtype, expected in EXPECTED:
        records = dig(name, rtype)
        found = any(expected in r for r in records)
        status = "PASS" if found else "FAIL"
        if found:
            passed += 1
        else:
            failed += 1
        fqdn = f"{name}.{DOMAIN}" if name else DOMAIN
        results.append((status, f"{rtype:5} {fqdn:45} {expected[:60]}..."))
        print(f"  [{status:4}] {rtype:5} {fqdn:45} -> {expected[:60]}{'...' if len(expected)>60 else ''}")
        if not found and records:
            print(f"           got: {records[:3]}")

    # Check forbidden records are gone
    print(f"\n  --- Checking old/broken records are removed ---\n")
    for name, rtype, forbidden in FORBIDDEN:
        records = dig(name, rtype)
        still_present = any(forbidden in r for r in records)
        status = "PASS" if not still_present else "WARN"
        if not still_present:
            passed += 1
        else:
            warnings += 1
        fqdn = f"{name}.{DOMAIN}" if name else DOMAIN
        print(f"  [{status:4}] {rtype:5} {fqdn:45} !contains {forbidden[:50]}")

    # Check for multiple SPF on root (should be exactly 1)
    print(f"\n  --- SPF record count check ---\n")
    root_txt = dig("", "TXT")
    spf_count = sum(1 for r in root_txt if r.startswith("v=spf1"))
    if spf_count == 1:
        passed += 1
        print(f"  [PASS] Root SPF count: {spf_count} (correct - single SPF)")
    else:
        failed += 1
        print(f"  [FAIL] Root SPF count: {spf_count} (MUST be 1, found {spf_count})")
        for r in root_txt:
            if r.startswith("v=spf1"):
                print(f"         -> {r}")

    # Summary
    total = passed + failed + warnings
    print(f"\n{'='*70}")
    print(f"SUMMARY: {passed}/{total} passed, {failed} failed, {warnings} warnings")
    if failed == 0 and warnings == 0:
        print("ALL CHECKS PASSED - DNS is fully propagated and correct!")
    elif failed == 0 and warnings > 0:
        print("All critical checks passed. Warnings may resolve as DNS propagates.")
    else:
        print(f"{failed} checks still failing - DNS may still be propagating.")
        print("Wait 1-24h and re-run. If still failing after 24h, check Hostinger panel.")
    print(f"{'='*70}\n")

    return failed == 0


def main():
    watch = "--watch" in sys.argv
    if watch:
        attempt = 1
        while True:
            print(f"\n>>> Watch attempt {attempt} <<<")
            ok = check_all()
            if ok:
                print("All DNS records propagated. Exiting watch mode.")
                return
            print("Waiting 60s before next check...")
            attempt += 1
            time.sleep(60)
    else:
        check_all()


if __name__ == "__main__":
    main()
