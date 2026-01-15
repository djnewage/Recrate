import { motion } from 'framer-motion'

export default function TermsOfService() {
  return (
    <div className="pt-24 pb-16 px-6 bg-black min-h-screen">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Terms of <span className="gradient-text">Service</span>
          </h1>
          <p className="text-gray-400 mb-8">
            Last updated: January 14, 2025
          </p>

          <div className="prose prose-invert prose-gray max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                By accessing or using Recrate's desktop application, mobile app, or website (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
              <p className="text-gray-300 leading-relaxed">
                Recrate is a DJ application that enables you to:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Stream your Serato music library to mobile devices over your local network</li>
                <li>Browse, search, and preview tracks from your music collection</li>
                <li>Create and manage crates that sync with Serato DJ Pro</li>
                <li>Use AI-powered features to curate playlists</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mt-4">
                All streaming and data transfer occurs locally on your network. Recrate does not host, store, or transmit your music files to external servers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. Eligibility</h2>
              <p className="text-gray-300 leading-relaxed">
                You must be at least 13 years of age to use the Service. By using the Service, you represent and warrant that you meet this age requirement. If you are under 18, you represent that you have your parent or guardian's permission to use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. User Responsibilities</h2>
              <p className="text-gray-300 leading-relaxed">By using the Service, you agree to:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li><strong>Legal music ownership:</strong> Only use Recrate with music files that you legally own or have the right to access</li>
                <li><strong>Proper use:</strong> Use the Service only for its intended purpose of managing and streaming your personal music library</li>
                <li><strong>Compliance:</strong> Comply with all applicable laws and regulations in your jurisdiction</li>
                <li><strong>No redistribution:</strong> Not use the Service to distribute, share, or publicly perform copyrighted music without proper authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Intellectual Property</h2>
              <p className="text-gray-300 leading-relaxed">
                The Service, including its original content, features, and functionality, is owned by Recrate and is protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <p className="text-gray-300 leading-relaxed mt-4">
                You retain all rights to your music files and library data. Recrate does not claim any ownership over your content.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">6. Prohibited Uses</h2>
              <p className="text-gray-300 leading-relaxed">You agree not to:</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Use the Service for any illegal purpose</li>
                <li>Attempt to reverse engineer, decompile, or disassemble the Service</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                <li>Use the Service to infringe upon the intellectual property rights of others</li>
                <li>Distribute malware or other harmful code through the Service</li>
                <li>Resell, sublicense, or commercially exploit the Service without authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">7. Disclaimer of Warranties</h2>
              <p className="text-gray-300 leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p className="text-gray-300 leading-relaxed mt-4">
                We do not warrant that the Service will be uninterrupted, secure, or error-free. We do not warrant the accuracy or reliability of any information obtained through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">8. Limitation of Liability</h2>
              <p className="text-gray-300 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, RECRATE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM:
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 mt-4">
                <li>Your use or inability to use the Service</li>
                <li>Any unauthorized access to or use of our servers</li>
                <li>Any interruption or cessation of transmission to or from the Service</li>
                <li>Any bugs, viruses, or similar issues transmitted through the Service</li>
                <li>Any errors or omissions in any content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">9. Indemnification</h2>
              <p className="text-gray-300 leading-relaxed">
                You agree to indemnify and hold harmless Recrate and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising out of or related to your use of the Service or violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">10. Termination</h2>
              <p className="text-gray-300 leading-relaxed">
                We may terminate or suspend your access to the Service immediately, without prior notice, for any reason, including without limitation if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">11. Governing Law</h2>
              <p className="text-gray-300 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Recrate operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">12. Changes to Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                We reserve the right to modify or replace these Terms at any time. We will provide notice of any material changes by posting the new Terms on this page and updating the "Last updated" date. Your continued use of the Service after any such changes constitutes your acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">13. Severability</h2>
              <p className="text-gray-300 leading-relaxed">
                If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions will remain in full force and effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">14. Contact Us</h2>
              <p className="text-gray-300 leading-relaxed">
                If you have any questions about these Terms, please contact us at:
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
