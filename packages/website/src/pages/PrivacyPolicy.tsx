import { motion } from 'framer-motion'

export default function PrivacyPolicy() {
  return (
    <div className="pt-24 pb-16 px-6 bg-black min-h-screen">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Privacy <span className="gradient-text">Policy</span>
          </h1>
          <p className="text-gray-400 mb-8">
            Last updated: January 14, 2025
          </p>

          <div className="prose prose-invert prose-gray max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
              <p className="text-gray-300 leading-relaxed">
                Recrate ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our desktop application and mobile app (collectively, the "Service").
              </p>
              <p className="text-gray-300 leading-relaxed mt-4">
                Recrate is a DJ application that enables you to stream your Serato music library to mobile devices and manage crates remotely. All music streaming occurs locally on your network — your audio files never leave your premises.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-medium text-white mt-6 mb-3">Information You Provide</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-2">
                <li><strong>Email address:</strong> If you join our waitlist or contact us through our website</li>
                <li><strong>Contact information:</strong> Name and message content when you use our contact form</li>
              </ul>

              <h3 className="text-xl font-medium text-white mt-6 mb-3">Information Collected Automatically</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-2">
                <li><strong>Device information:</strong> Device type, operating system, and browser type when visiting our website</li>
                <li><strong>Usage analytics:</strong> Anonymous usage statistics through Vercel Analytics to understand how visitors interact with our website</li>
                <li><strong>Error reports:</strong> Crash reports and error logs through Sentry to help us identify and fix issues</li>
              </ul>

              <h3 className="text-xl font-medium text-white mt-6 mb-3">Information We Do NOT Collect</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-2">
                <li>Your music files or audio content</li>
                <li>Your Serato library metadata</li>
                <li>Crate names or track information</li>
                <li>Any data transmitted between the desktop app and mobile app on your local network</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-300 leading-relaxed">We use the information we collect to:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Respond to your inquiries and provide customer support</li>
                <li>Send you updates about the mobile app launch (if you joined the waitlist)</li>
                <li>Improve our website and services</li>
                <li>Identify and fix technical issues</li>
                <li>Analyze usage patterns to enhance user experience</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. Local Network Usage</h2>
              <p className="text-gray-300 leading-relaxed">
                Recrate operates entirely on your local network. When you use our Service:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Music streaming occurs directly between your computer and mobile device over WiFi</li>
                <li>No audio data is transmitted to our servers or any third-party servers</li>
                <li>Your music library metadata stays on your local network</li>
                <li>Crate modifications are saved locally to your Serato database files</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                This local-first approach means your music collection and DJ data remain private and under your control.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Third-Party Services</h2>
              <p className="text-gray-300 leading-relaxed">Our website uses the following third-party services:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li><strong>Vercel Analytics:</strong> For anonymous website usage statistics</li>
                <li><strong>Sentry:</strong> For error tracking and crash reporting</li>
                <li><strong>Formspree:</strong> For processing contact form submissions and waitlist signups</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                These services have their own privacy policies governing their use of data. We encourage you to review their policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">6. Data Retention</h2>
              <p className="text-gray-300 leading-relaxed">
                We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Waitlist emails are retained until you unsubscribe or request deletion</li>
                <li>Contact form submissions are retained for up to 2 years</li>
                <li>Analytics data is aggregated and anonymized</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights</h2>
              <p className="text-gray-300 leading-relaxed">You have the right to:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your personal information</li>
                <li>Unsubscribe from our mailing list at any time</li>
                <li>Object to processing of your personal information</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                To exercise any of these rights, please contact us using the information below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">8. Data Security</h2>
              <p className="text-gray-300 leading-relaxed">
                We implement appropriate technical and organizational measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">9. Children's Privacy</h2>
              <p className="text-gray-300 leading-relaxed">
                Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">10. Changes to This Policy</h2>
              <p className="text-gray-300 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">11. Contact Us</h2>
              <p className="text-gray-300 leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="text-gray-300 mt-4">
                <a href="mailto:hello@recrate.app" className="text-purple-400 hover:text-purple-300 transition-colors">
                  hello@recrate.app
                </a>
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
