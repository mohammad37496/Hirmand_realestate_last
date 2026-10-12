import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { SITE } from "@/lib/site";
import "@/staff-agreement.css";

export const STAFF_AGREEMENT_VERSION = "1.1";

export const Route = createFileRoute("/staff-agreement")({
  component: StaffAgreementPage,
  head: () => ({
    meta: [
      { title: `Employee Mobile Device Use Agreement | ${SITE.nameFa}` },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Official Hirmand Real Estate employee mobile device use, monitoring and consent agreement.",
      },
    ],
  }),
});

const sections = [
  {
    number: 1,
    title: "Purpose of This Agreement",
    paragraphs: [
      "This Agreement establishes the rules, responsibilities, permissions, security requirements, data-access practices, and monitoring conditions applicable to employees and authorized personnel who use a mobile device owned, provided, controlled, or designated by Hirmand Real Estate.",
      "The purpose of this Agreement is to ensure that every employee understands clearly and in advance whether the phone is company-owned and fully managed, or personally owned and used through an Android Work Profile; which categories of device information and functions the Hirmand Real Estate application may access; why such access may be required; which information may be processed, stored, transmitted, synchronized, or made available to authorized company personnel; what the employee is agreeing to when accepting this Agreement; and how permissions may be granted, denied, revoked, or changed under Android and within the application.",
      "This Agreement is intended to provide clear notice and informed consent. It does not authorize the application to bypass Android security mechanisms, obtain permissions without system approval, or access information that Android or the application's technical controls prohibit.",
    ],
  },
  {
    number: 2,
    title: "Device Ownership and Management Mode",
    paragraphs: [
      "The Hirmand employee application supports two Android Enterprise deployment modes. On a company-owned phone, Hirmand may enroll the device as Fully Managed / Device Owner. On a personally owned phone, Hirmand may use an Android Work Profile / Profile Owner so that the managed workspace remains separated from the personal profile.",
      "The selected deployment mode determines the technical scope of device management and which Android policies are available.",
    ],
    bullets: [
      "Company-owned phone: the device may be Fully Managed and subject to organization-wide device policies appropriate for company operations.",
      "Personally owned phone: the company-managed workspace is the Work Profile; personal-profile data remains outside that managed workspace.",
      "The employee must not intentionally disable or circumvent the applicable Android Enterprise management controls.",
      "The employee must immediately report loss, theft, unauthorized access, suspicious activity, or suspected compromise.",
      "The employee understands that the technical scope of monitoring and management depends on the deployment mode and the Android policies actually enabled.",
    ],
  },
  {
    number: 3,
    title: "The Hirmand Real Estate Application",
    paragraphs: [
      'The application named "املاک هیرمند" (Hirmand Real Estate) is the official employee application designated by Hirmand Real Estate for authorized company mobile-device operations.',
      "Depending on the features enabled by the company, the application may support employee identification and device assignment, business communication and operational coordination, device status and security information, location and workplace-related functionality, contacts and business communication, calls and call-related information, business messaging and SMS-related functionality, calendar and scheduling, camera and image capture, microphone and audio recording for authorized business functions, file and media handling, notification-related functionality, application and device inventory, Wi-Fi and connectivity information, security and diagnostics, and other business functions specifically disclosed before activation.",
      "Features may be added or changed in future versions. Any materially new sensitive access should be disclosed to the employee before that access is activated, with applicable Android permission controls presented where required.",
    ],
  },
  {
    number: 4,
    title: "Sensitive Information and Permissions",
    paragraphs: [
      "The application may request access to sensitive device capabilities and information when required for authorized company functions. The categories below are specifically disclosed to the employee.",
    ],
  },
  {
    number: 4,
    title: "4.1 Location Information",
    paragraphs: [
      "The application may request approximate location, precise location, and where technically and legally permitted and required, background location access. Location information may be used for device location, workplace or attendance functions, business security, device recovery, and operational coordination.",
    ],
  },
  {
    number: 4,
    title: "4.2 Camera Access",
    paragraphs: [
      "The application may request camera access for authorized business purposes such as taking property photographs, capturing documents, scanning business identifiers, or other company-approved image capture. Camera permission is not intended as unrestricted authorization for covert recording.",
    ],
  },
  {
    number: 4,
    title: "4.3 Microphone and Audio Recording",
    paragraphs: [
      "The application may request microphone access for authorized business voice notes, voice communication, authorized business audio, or other explicitly enabled company functions. Microphone access must remain subject to Android controls and applicable law.",
    ],
  },
  {
    number: 4,
    title: "4.4 Contacts",
    paragraphs: [
      "The application may request access to contacts stored on the device for approved business communication, customer, owner, consultant, partner, or other business-contact workflows. Contact information must be handled only for legitimate business purposes.",
    ],
  },
  {
    number: 4,
    title: "4.5 Phone and Call Information",
    paragraphs: [
      "Where technically available and authorized, the application may request access to phone-related information, including phone-number information, business call records, call history, or other functions necessary for approved company communication workflows.",
    ],
  },
  {
    number: 4,
    title: "4.6 SMS and Messaging Information",
    paragraphs: [
      "Where technically available and specifically enabled, the application may request access to SMS messages or related metadata for authorized business messaging workflows, subject to Android restrictions and applicable platform policies.",
    ],
  },
  {
    number: 4,
    title: "4.7 Calendar Information",
    paragraphs: [
      "The application may request calendar access for business appointments, property visits, employee schedules, meetings, reminders, and other authorized operational scheduling.",
    ],
  },
  {
    number: 4,
    title: "4.8 Files and Media",
    paragraphs: [
      "The application may request or use Android-supported mechanisms to access photographs, videos, audio files, PDF documents, business documents, and other files selected or made available to the application. Selected files may be processed, stored, or transmitted to designated Hirmand Real Estate systems when required for a business function.",
    ],
  },
  {
    number: 4,
    title: "4.9 Installed Applications and Device Inventory",
    paragraphs: [
      "The application may access application inventory information when necessary for device inventory, security assessment, compatibility checks, business software management, or troubleshooting. This does not by itself grant access to the private contents of unrelated applications.",
    ],
  },
  {
    number: 4,
    title: "4.10 Notifications",
    paragraphs: [
      "The application may request notification-related access or use Android notification features for business alerts, security alerts, operational reminders, company communications, and device-status notifications. Notification-listening features, where enabled, may expose notification content from other applications and therefore constitute sensitive access.",
    ],
  },
  {
    number: 4,
    title: "4.11 Wi-Fi, Network and Connectivity Information",
    paragraphs: [
      "The application may use or access Wi-Fi connection state, network information, connectivity status, nearby wireless-device information where required, Bluetooth-related information, or local-network information needed for company systems.",
    ],
  },
  {
    number: 4,
    title: "4.12 Device and System Information",
    paragraphs: [
      "The application may process technical information necessary for company device administration and security, such as device model, Android version, application version, permitted device identifiers, battery state, storage availability, network status, security status, and diagnostic information.",
    ],
  },
  {
    number: 5,
    title: "High-Sensitivity and Special Access",
    paragraphs: [
      "Certain Android capabilities may require additional system controls beyond ordinary runtime permissions. Depending on future features, these may include background location, notification access, accessibility-related capabilities, display-over-other-apps, device administration, usage statistics, specialized connectivity, or other Android Special App Access.",
      "Acceptance of this Agreement does not itself grant any Android permission. When Android requires separate system approval, the applicable Android screen or permission request must be presented before activation.",
    ],
  },
  {
    number: 6,
    title: "How Information May Be Used",
    paragraphs: [
      "Information accessed through the application may be used for legitimate company purposes including business operations, employee and device management, security, workplace coordination, customer and property service, business communications, scheduling, record keeping, troubleshooting, device recovery, protection of company property, and compliance with company policies and applicable law.",
      "The application should not intentionally access unrelated data merely because a technical permission exists.",
    ],
  },
  {
    number: 7,
    title: "Data Transmission and Storage",
    paragraphs: [
      "Depending on the implemented feature, information may be processed on the device, temporarily cached, stored in protected application storage, transmitted to designated Hirmand Real Estate systems, stored in company-controlled infrastructure, and made available to authorized personnel. Granting a permission does not necessarily mean that the underlying information is continuously transmitted.",
    ],
  },
  {
    number: 8,
    title: "Monitoring and Transparency",
    paragraphs: [
      "The employee understands that the device is a company asset and that the company may operate security and administrative controls on it. The purpose of the application is not unrestricted or secret surveillance. Appropriate user-visible indications should be provided for sensitive operations where Android or the application's design requires or supports such notice.",
    ],
  },
  {
    number: 9,
    title: "No Circumvention of Android Security",
    paragraphs: [
      "Nothing in this Agreement authorizes bypassing Android permission systems, exploiting operating-system vulnerabilities, hiding sensitive access from the user, capturing passwords or authentication secrets from unrelated applications, defeating Android privacy indicators, secretly activating a camera or microphone contrary to applicable controls, or accessing data that the operating system has denied to the application.",
    ],
  },
  {
    number: 10,
    title: "Employee Responsibilities",
    bullets: [
      "Use the company device responsibly.",
      "Protect the device from unauthorized access.",
      "Never share device credentials with unauthorized persons.",
      "Report loss, theft, damage, or suspected compromise immediately.",
      "Do not intentionally disable required security protections.",
      "Do not install unauthorized software when prohibited by company policy.",
      "Use sensitive company information only for legitimate business activities.",
      "Cooperate with reasonable device maintenance, security, and troubleshooting procedures.",
      "Notify the company when a relevant Android permission is revoked or a required device setting changes.",
      "Return the device when requested by the company or when employment or authorization ends.",
    ],
  },
  {
    number: 11,
    title: "Permission Changes and Revocation",
    paragraphs: [
      "Android may allow permissions to be granted, denied, temporarily granted, automatically revoked, restricted, or changed by the operating system. Denying or revoking a permission may disable the related feature. The company may request re-authorization when a business feature requires a permission that is no longer available.",
    ],
  },
  {
    number: 12,
    title: "Changes to the Application",
    paragraphs: [
      "Hirmand Real Estate may update the application for security, bug fixes, compatibility, performance, and business requirements. If an update introduces a materially new sensitive data category or materially changes the purpose of existing sensitive access, the company should provide updated notice and, where appropriate, obtain renewed consent before activating that functionality.",
    ],
  },
  {
    number: 13,
    title: "Employee Acknowledgment",
    bullets: [
      "The device is recognized as a company-owned or company-controlled business device.",
      "The employee has been informed about the categories of sensitive device information the application may request.",
      "The employee understands the business reasons for those requests.",
      "The employee understands that Android may display additional permission dialogs and controls.",
      "The employee understands that denying a permission may disable the related feature.",
      "The employee understands that granting a permission does not necessarily mean the information is continuously collected or transmitted.",
      "The employee understands that company systems may process authorized business information obtained through the application.",
      "The employee has had an opportunity to review this Agreement before accepting it.",
    ],
  },
  {
    number: 14,
    title: "Electronic Signature and First-Launch Acceptance",
    paragraphs: [
      "The first time the employee launches the application, the application displays this Agreement before access to the main application is provided. The employee must actively confirm acceptance by selecting the electronic-signature checkbox and pressing the acceptance button.",
      "The application must not treat scrolling, opening, closing, or merely viewing this document as acceptance. Acceptance requires an affirmative user action.",
      "The application may record agreement version, date and time of acceptance, application version, device record identifier designated by the company, and the employee account or assigned employee identity where applicable.",
    ],
  },
  {
    number: 15,
    title: "Privacy Expectations by Device Mode",
    paragraphs: [
      "On a company-owned Fully Managed device, the employee should not expect the same privacy boundaries as on a personally owned phone because the organization may apply device-wide management policies supported by Android Enterprise.",
      "On a personally owned phone using Work Profile, the Hirmand-managed workspace is separated from the personal profile. Company administration should operate within the managed profile and the policies Android makes available to the Profile Owner; it is not equivalent to making the personal phone a company-owned Fully Managed device.",
      "In either mode, company policy and applicable technical controls should limit access to legitimate business purposes.",
    ],
  },
  {
    number: 16,
    title: "Security of Employee and Company Information",
    paragraphs: [
      "Hirmand Real Estate shall take reasonable technical and organizational measures appropriate to the implemented system to protect company and employee information against unauthorized access, loss, misuse, or disclosure. Access should be limited according to the role and authorization of personnel who require the information for legitimate company purposes.",
    ],
  },
  {
    number: 17,
    title: "Acknowledgment of Understanding",
    paragraphs: [
      "The employee confirms that this Agreement has been presented in a form intended to be understandable before the application is used. The employee understands that the application may request significant and sensitive access to the company device and is expected to understand those capabilities before accepting this Agreement.",
    ],
  },
];

function StaffAgreementPage() {
  return (
    <SiteChrome>
      <main className="staff-agreement-page">
        <div className="staff-agreement-shell">
          <header className="staff-agreement-hero">
            <div className="staff-agreement-hero-icon" aria-hidden="true">
              <ShieldCheck size={29} />
            </div>
            <div>
              <span className="kicker">HIRMAND REAL ESTATE · INTERNAL</span>
              <h1>Employee Mobile Device Use, Monitoring & Consent Agreement</h1>
              <p>
                Official agreement for employees using a company-owned Hirmand Real Estate mobile device
                or a personally owned device with an Android Work Profile, together with the <strong>املاک هیرمند</strong> employee application.
              </p>
            </div>
          </header>

          <section className="staff-agreement-meta">
            <div><span>Application</span><strong>املاک هیرمند</strong></div>
            <div><span>Company</span><strong>Hirmand Real Estate</strong></div>
            <div><span>Agreement version</span><strong>{STAFF_AGREEMENT_VERSION}</strong></div>
          </section>

          <section className="staff-agreement-intro">
            <FileText size={18} />
            <p>
              This is the complete version of the agreement. Employees should review it before accepting
              the electronic signature shown inside the mobile application.
            </p>
          </section>

          <div className="staff-agreement-sections">
            {sections.map((section, index) => (
              <section key={index} id={`section-${section.number}-${index}`} className="staff-agreement-section">
                <div className="staff-agreement-section-number">{section.number}</div>
                <div className="staff-agreement-section-body">
                  <h2>{section.title}</h2>
                  {section.paragraphs?.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                  {section.bullets?.length ? (
                    <ul>
                      {section.bullets.map((bullet) => <li key={bullet}><CheckCircle2 size={15} />{bullet}</li>)}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </div>

          <section className="staff-agreement-signature-note">
            <h2>Electronic Acceptance</h2>
            <p>
              The electronic signature is completed inside the <strong>املاک هیرمند</strong> application by
              actively selecting the agreement checkbox and pressing the acceptance button.
            </p>
            <p className="staff-agreement-back">
              You can now return to the mobile application and complete the first-launch acceptance.
            </p>
          </section>

          <footer className="staff-agreement-footer">
            <span>Hirmand Real Estate · Isfahan, Iran</span>
            <a href="/admin">Admin</a>
            <a href="/staff-agreement">Permalink</a>
          </footer>

          <a className="staff-agreement-back-link" href="/">
            <ArrowRight size={16} />
            بازگشت به سایت هیرمند
          </a>
        </div>
      </main>
    </SiteChrome>
  );
}
