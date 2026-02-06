import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isHomePage = location.pathname === '/'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Recrate" className="w-10 h-10 rounded-xl" />
            <span className="text-xl font-bold gradient-text">Recrate</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {isHomePage && (
              <>
                <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
                <a href="#demo" className="text-gray-300 hover:text-white transition-colors">Demo</a>
                <a href="#how-to-use" className="text-gray-300 hover:text-white transition-colors">How to Use</a>
                <a href="#faq" className="text-gray-300 hover:text-white transition-colors">FAQ</a>
                <a href="#download" className="text-gray-300 hover:text-white transition-colors">Download</a>
                <a href="#contact" className="text-gray-300 hover:text-white transition-colors">Contact</a>
              </>
            )}
            <Link to="/cleanse" className="text-gray-300 hover:text-white transition-colors">Cleanse</Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/10 bg-black">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Recrate" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold">Recrate</span>
          </Link>
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} Recrate. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/cleanse" className="text-gray-400 hover:text-white transition-colors text-sm">
              Cleanse
            </Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors text-sm">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-gray-400 hover:text-white transition-colors text-sm">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
