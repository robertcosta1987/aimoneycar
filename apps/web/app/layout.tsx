import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CogniVenda IA - Inteligência Artificial para Revendas',
    template: '%s | CogniVenda IA',
  },
  description:
    'Transforme sua revenda de veículos com inteligência artificial. Alertas inteligentes, análise de margem e assistente virtual para maximizar seus lucros.',
  keywords: [
    'revenda de veículos',
    'inteligência artificial',
    'CRM automotivo',
    'gestão de estoque',
    'lucro revenda',
    'WhatsApp business',
    'cognivenda',
  ],
  authors: [{ name: 'CogniVenda IA' }],
  creator: 'CogniVenda IA',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://cognivenda.ai',
    siteName: 'CogniVenda IA',
    title: 'CogniVenda IA - Inteligência Artificial para Revendas',
    description:
      'Transforme sua revenda de veículos com inteligência artificial.',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'CogniVenda IA',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CogniVenda IA',
    description: 'Inteligência Artificial para Revendas de Veículos',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0A0E14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
