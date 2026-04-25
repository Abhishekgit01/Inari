export interface AttackReportSection {
  id: string;
  title: string;
  where: string;
  summary: string;
  narrative: string[];
  attacks: string[];
  prevention: string[];
}

export const ATTACK_REPORT_TITLE = 'The Enterprise Attack Surface Field Report';
export const ATTACK_REPORT_SUBTITLE =
  'A practical guide to where attackers usually enter, how they move, and what actually reduces risk.';
export const ATTACK_REPORT_DATE = 'April 24, 2026';

export const ATTACK_REPORT_INTRO = [
  'Most breaches do not begin with a movie-style zero day. They begin with something ordinary: a phished identity, an exposed remote access service, a forgotten workload, a stale API token, an over-privileged admin account, or an internal system that no one expected to be internet-reachable.',
  'That is why a useful security report should not read like a list of scary buzzwords. It should read like a field guide. The point is to understand where pressure lands first, what an attacker is trying to achieve at each stop, and which controls actually interrupt the path before it becomes a business problem.',
  'This report is written that way. It covers the main enterprise attack surfaces, the attacks that commonly hit each one, and the prevention habits that matter most in practice. It is broad on purpose, but still grounded enough to use in architecture reviews, tabletop exercises, onboarding packs, and customer-facing risk conversations.',
];

export const ATTACK_REPORT_SECTIONS: AttackReportSection[] = [
  {
    id: 'edge-email',
    title: 'Internet Edge, Email, and Remote Access',
    where: 'Email gateways, VPNs, remote desktops, exposed firewalls, public login portals, and forgotten internet-facing services.',
    summary:
      'This is still the easiest way into many environments because it mixes human error with exposed infrastructure.',
    narrative: [
      'Attackers love the edge because the edge is noisy. Internet-facing systems are expected to receive traffic from everywhere, which means malicious behavior often hides inside what looks like ordinary activity. Password spraying against a VPN, a fake Microsoft 365 login page, or a vulnerable remote management portal can all open the first door.',
      'Email remains especially effective because it lets the attacker borrow trust before they borrow access. A convincing reset message, invoice thread, or shared document request still outperforms many purely technical attacks. Once a user gives up credentials or runs a loader, the attacker rarely needs to break in loudly. They simply log in.',
    ],
    attacks: [
      'Phishing, business email compromise, attachment-based malware, malicious OAuth consent, password spraying, MFA fatigue, VPN exploitation, exposed RDP abuse, and edge device exploitation.',
    ],
    prevention: [
      'Use phishing-resistant MFA for all privileged and remote access paths.',
      'Reduce external exposure: disable unused portals, lock down RDP, and keep an inventory of every internet-facing service.',
      'Run conditional access policies, device trust checks, and impossible-travel style identity detections.',
      'Harden email with DMARC, URL rewriting, attachment detonation, and clear out-of-band approval rules for payment or credential requests.',
    ],
  },
  {
    id: 'identity',
    title: 'Identity, SSO, and Privilege Escalation',
    where: 'Identity providers, admin consoles, service principals, API tokens, PAM systems, and any workflow that grants broad access.',
    summary:
      'In modern environments, identity is often the real perimeter. When identity falls, the rest of the network usually follows.',
    narrative: [
      'A lot of organizations still think of identity as an IT problem rather than an attack surface. Attackers do not make that distinction. If they capture a cloud admin token, abuse legacy authentication, or find a stale service credential in a repo, they can move with the same privileges your own team uses.',
      'The danger is not just compromise. It is silent privilege. A low-noise attacker will spend time mapping who can assume which role, which apps can mint tokens, which accounts bypass MFA, and where dormant privileges were never cleaned up. By the time anyone notices, the activity already looks administrative.',
    ],
    attacks: [
      'Credential theft, token replay, pass-the-cookie, Kerberoasting, Golden/Silver Ticket abuse, OAuth consent abuse, service account compromise, and privilege escalation through role chaining.',
    ],
    prevention: [
      'Enforce least privilege and time-bound admin access instead of permanent standing privilege.',
      'Disable legacy auth, protect tokens like passwords, and rotate machine credentials on a schedule.',
      'Alert on unusual role assumption, new persistence in identity platforms, and privilege elevation outside change windows.',
      'Separate human admin identities from everyday user accounts and keep break-glass accounts tightly monitored.',
    ],
  },
  {
    id: 'endpoints',
    title: 'Workstations and User Endpoints',
    where: 'Employee laptops, VDI sessions, unmanaged contractor devices, jump boxes, and shared workstations.',
    summary:
      'Endpoints are where malicious code, stolen credentials, and interactive attacker behavior become real.',
    narrative: [
      'Once an attacker reaches an endpoint, the conversation changes. They are no longer trying only to get in; they are trying to stay in, learn the environment, and blend with daily work. Browser sessions, password stores, SSH keys, chat history, and corporate documents all become useful.',
      'Endpoints are also where detection quality can make or break the rest of the response. A suspicious process tree, a new scheduled task, or a burst of credential dumping activity often appears here before it appears anywhere else. If endpoint visibility is weak, defenders lose the best early warning system they have.',
    ],
    attacks: [
      'Malware loaders, credential dumping, browser token theft, malicious PowerShell, LOLBins abuse, ransomware staging, keylogging, and lateral movement launched from a compromised host.',
    ],
    prevention: [
      'Run EDR or equivalent host telemetry everywhere that matters, including admin workstations and jump hosts.',
      'Block or constrain risky scripting where possible and monitor parent-child process anomalies.',
      'Separate admin tasks from general browsing and email activity.',
      'Keep local admin rights rare, controlled, and reviewed regularly.',
    ],
  },
  {
    id: 'apps-apis',
    title: 'Application Servers and APIs',
    where: 'Public web apps, internal APIs, microservices, mobile backends, and machine-to-machine interfaces.',
    summary:
      'Applications are a favorite target because they sit close to data and often carry overly broad trust into other systems.',
    narrative: [
      'Application compromise is rarely just about the bug itself. The real prize is what the application can reach once it is exploited. A simple auth bypass, SSRF, deserialization issue, or leaked secret becomes much more damaging when the app can query internal services, mint tokens, or touch production data.',
      'APIs deserve special attention because teams often assume internal APIs are safe by default. They are not. If an attacker compromises one upstream service or abuses a weak service credential, internal APIs can become a quiet highway into storage, identity, billing, and customer records.',
    ],
    attacks: [
      'SQL injection, SSRF, auth bypass, deserialization, template injection, command injection, secret leakage, API key theft, and trust abuse between microservices.',
    ],
    prevention: [
      'Treat internal APIs as hostile by default: authenticate them, authorize them, and log them.',
      'Keep secrets out of code and CI logs, and rotate them when developers or vendors change.',
      'Add WAF rules for common attack classes, but do not rely on WAFs as the main control.',
      'Run code review, dependency scanning, and attack-path testing on the services that sit closest to customer data.',
    ],
  },
  {
    id: 'data',
    title: 'Databases, Storage, and Crown-Jewel Data',
    where: 'Production databases, warehouse clusters, blob storage, backups, analytics stores, and data sync jobs.',
    summary:
      'Attackers do not move laterally forever. They move until they reach the data that matters.',
    narrative: [
      'Database attacks often arrive late in the kill chain, which is why teams underestimate them. By the time an attacker is touching core data stores, the earlier controls have already failed. The last line of defense is whether access is segmented, observable, and intentionally narrow.',
      'It is common to find production data accessible from application tiers that do not need broad write access, or service accounts that can read entire datasets because no one ever tightened them after launch. Those shortcuts save time during development, but they become exfiltration paths during a breach.',
    ],
    attacks: [
      'Database credential theft, lateral movement into data tiers, bulk export abuse, cloud bucket exposure, destructive queries, ransomware against backup stores, and stealthy exfiltration over approved channels.',
    ],
    prevention: [
      'Segment data tiers hard and make east-west access explicit rather than assumed.',
      'Audit who can read, dump, or export large datasets and remove broad permissions from app services.',
      'Log large reads, unusual query volume, and new access paths into sensitive stores.',
      'Encrypt at rest and in transit, but pair that with access controls or encryption will not save you from misuse.',
    ],
  },
  {
    id: 'web-attack-families',
    title: 'Web Attack Families Every Product Team Should Review',
    where: 'Login forms, search boxes, report exports, filter endpoints, admin panels, upload flows, webhooks, and any route that accepts external input.',
    summary:
      'Most web risk is not one bug. It is a family of failure modes that reappear in slightly different shapes across products.',
    narrative: [
      'Teams often ask, "How many SQL injections are there?" The practical answer is that defenders usually worry about several recurring classes rather than an infinite list of unique tricks. The common families are error-based issues, union-style data extraction issues, blind logic flaws, time-based inference flaws, and second-order cases where unsafe input is stored first and weaponized later. The exact payloads change, but the defensive lesson is stable: never let raw input dictate query structure.',
      'The same pattern shows up outside SQL injection as well. XSS is rarely just "script tags in a field"; it is a broader output-encoding problem. SSRF is rarely just a broken webhook; it is any server-side feature that fetches attacker-supplied destinations. File upload risk is rarely just one bad extension check; it is the combination of parsing, storage, previewing, and execution paths. Thinking in families keeps reviews honest.',
      'A mature product review therefore asks a more useful question than "Do we have one SQL injection?" It asks where user-controlled input crosses trust boundaries, which code paths transform it, where it is stored, and what high-value systems sit behind that trust boundary if validation fails.',
    ],
    attacks: [
      'Common SQL injection families defenders test for: error-based behavior, union-style extraction, blind logic abuse, time-based inference, and second-order query abuse.',
      'Other common web attack families: XSS, SSRF, broken auth/session handling, insecure file upload, path traversal, template injection, command injection, and webhook abuse.',
      'Attackers rarely bet on one route. They probe search, export, login, upload, and admin flows together until a weak boundary appears.',
    ],
    prevention: [
      'Use parameterized queries or safe ORM abstractions everywhere, including background jobs and reporting paths.',
      'Validate and normalize input on the server, then encode output based on the exact rendering context.',
      'Treat any feature that fetches remote URLs, stores files, or previews user content as a separate threat model with its own controls.',
      'Keep security tests close to the product lifecycle: code review, SAST, dependency review, unit tests for dangerous parsers, and recurring authenticated attack-path review.',
    ],
  },
  {
    id: 'cloud-k8s',
    title: 'Cloud Control Plane and Kubernetes',
    where: 'Cloud IAM, management APIs, serverless runtimes, container registries, Kubernetes clusters, and CI-issued cloud credentials.',
    summary:
      'Cloud attacks are dangerous because they often let an intruder manage the environment instead of merely occupying it.',
    narrative: [
      'In cloud-native environments, management plane access is often more powerful than host access. A compromised CI token, overly broad role, or exposed cloud key can let an attacker read secrets, alter infrastructure, snapshot disks, or create persistence without touching a single workstation.',
      'Kubernetes brings its own version of the same problem. The cluster is not just a scheduler; it is a trust fabric. Weak RBAC, overly permissive service accounts, exposed dashboards, and risky admission settings can turn one container foothold into cluster-wide influence.',
    ],
    attacks: [
      'Cloud key theft, IAM abuse, role chaining, container escape, poisoned images, cluster RBAC abuse, exposed metadata service abuse, and persistence through management APIs.',
    ],
    prevention: [
      'Use short-lived cloud credentials and workload identity wherever possible.',
      'Constrain service accounts, admission privileges, and cluster admin access tightly.',
      'Continuously review public exposure, cross-account trust, and high-risk role assumptions.',
      'Protect CI and registry paths as production assets, not just developer plumbing.',
    ],
  },
  {
    id: 'saas-collaboration',
    title: 'SaaS, Collaboration, and Business Systems',
    where: 'Microsoft 365, Google Workspace, Slack, Teams, Jira, CRM, HR systems, and file-sharing platforms.',
    summary:
      'A breach does not need malware to be serious. Business systems can be abused directly for fraud, data theft, and persistence.',
    narrative: [
      'Attackers increasingly prefer environments where everything they need already exists inside the SaaS estate. If they gain a mailbox, a chat account, or an internal wiki account, they can learn suppliers, steal documents, redirect approvals, and plant believable follow-on lures without ever dropping an executable.',
      'This makes response harder because the activity looks close to business as usual. The attacker uses the same collaboration tools your staff uses, often with valid sessions and minimal technical noise. Controls need to focus on session trust, abnormal sharing, and unusual admin changes.',
    ],
    attacks: [
      'Business email compromise, malicious inbox rules, OAuth app abuse, mass file sharing, guest account misuse, approval fraud, and data theft through collaboration tools.',
    ],
    prevention: [
      'Monitor for new mail-forwarding rules, suspicious OAuth grants, and unusual external sharing.',
      'Require strong session controls for admin actions and sensitive file access.',
      'Keep guest access narrow and time-bound, especially in chat and file-sharing systems.',
      'Train finance, legal, and executive support staff on approval fraud, not just generic phishing.',
    ],
  },
  {
    id: 'ops-backup',
    title: 'Backups, Management Tooling, and Recovery Infrastructure',
    where: 'Backup servers, hypervisor consoles, RMM tools, patching systems, secrets vaults, and admin jump environments.',
    summary:
      'These systems are supposed to help you recover. That is exactly why attackers target them.',
    narrative: [
      'The worst breach stories usually involve a second failure: the systems designed to restore order were reachable, under-protected, or quietly compromised first. If attackers can tamper with backups, push malicious scripts through RMM, or mint secrets from a vault, the blast radius expands dramatically.',
      'Management systems deserve more paranoia than ordinary production assets because their normal job is to act at scale. A small compromise in a central admin system can become a very large problem very quickly.',
    ],
    attacks: [
      'Backup deletion, vault abuse, remote management takeover, patching-platform abuse, hypervisor compromise, and mass deployment of malicious configuration or binaries.',
    ],
    prevention: [
      'Isolate backup and recovery systems from daily admin workflows and keep offline or immutable copies.',
      'Require stronger approval and logging around high-scale management actions.',
      'Treat vault access as privileged identity, with strict review and short-lived access where possible.',
      'Continuously test restore procedures; a backup that cannot be restored is not a control.',
    ],
  },
  {
    id: 'third-party',
    title: 'Third-Party Vendors, CI/CD, and the Supply Chain',
    where: 'Build pipelines, package registries, code repositories, deployment bots, managed service providers, and external vendors with connectivity.',
    summary:
      'The supply chain is attractive because it lets attackers borrow trusted paths into many systems at once.',
    narrative: [
      'A trusted vendor account, poisoned build step, or compromised dependency can do more damage than a noisy external intrusion because it arrives wearing approved credentials and known process names. Teams often secure production while leaving the build and vendor paths comparatively soft.',
      'Good supply-chain defense is boring in the best way. It depends on tight change control, artifact provenance, restricted bot permissions, and the willingness to disable trust paths that are no longer justified.',
    ],
    attacks: [
      'Malicious dependency injection, CI secret theft, repository takeover, vendor credential abuse, MSP pivoting, and software update tampering.',
    ],
    prevention: [
      'Lock down CI secrets, branch protections, deployment approvals, and package publishing rights.',
      'Use signed artifacts and provenance checks for critical release paths.',
      'Review third-party access like internal privilege: narrow, time-bound, and auditable.',
      'Plan how to revoke vendor or bot trust quickly during an incident.',
    ],
  },
  {
    id: 'operating-model',
    title: 'What Actually Lowers Risk Across the Whole Estate',
    where: 'This is the operating model layer: how teams detect, decide, contain, and recover across every surface above.',
    summary:
      'Security products help, but durable risk reduction usually comes from disciplined operating habits.',
    narrative: [
      'The healthiest environments are not the ones with the most dashboards. They are the ones where attack paths are continuously shortened. Internet exposure is known, privilege is reviewed, telemetry is present on critical assets, containment is rehearsed, and decision rights are clear when something goes wrong.',
      'That is also where a platform like Athernex becomes useful in a credible way. It should ingest live signals from real infrastructure, help analysts understand where the attacker is likely to pivot next, and support approval-based response. It should not pretend to replace security engineering, identity hygiene, or incident discipline.',
    ],
    attacks: [
      'Cross-layer campaigns that mix identity abuse, host compromise, application trust abuse, and data exfiltration.',
    ],
    prevention: [
      'Keep asset inventory, identity inventory, and external exposure inventory current enough to act on.',
      'Collect telemetry from the places that decide incidents: identity, endpoint, network edge, application, and data tiers.',
      'Rehearse approval-based containment for high-risk actions before an emergency.',
      'Measure false positives, time to detect, time to isolate, and time to recover, not just alert count.',
    ],
  },
];

export const buildAttackReportMarkdown = () => {
  const sectionBlocks = ATTACK_REPORT_SECTIONS.map((section) => {
    const narrative = section.narrative.map((paragraph) => paragraph).join('\n\n');
    const attacks = section.attacks.map((item) => `- ${item}`).join('\n');
    const prevention = section.prevention.map((item) => `- ${item}`).join('\n');
    return `## ${section.title}

Where it lands:
${section.where}

${section.summary}

${narrative}

Common attack paths:
${attacks}

How to prevent it:
${prevention}`;
  }).join('\n\n');

  const intro = ATTACK_REPORT_INTRO.join('\n\n');

  return `# ${ATTACK_REPORT_TITLE}

${ATTACK_REPORT_SUBTITLE}

Date: ${ATTACK_REPORT_DATE}

${intro}

${sectionBlocks}
`;
};
