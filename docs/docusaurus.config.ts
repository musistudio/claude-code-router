import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Claude Code Router',
  tagline: 'Use Claude Code without an Anthropics account and route it to another LLM provider',
  favicon: 'img/favicon.ico',

  url: 'https://musistudio.github.io',
  baseUrl: '/claude-code-router/',

  organizationName: 'musistudio',
  projectName: 'claude-code-router',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  onBrokenAnchors: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/musistudio/claude-code-router/tree/main/docs',
        },
        blog: {
          showReadingTime: true,
          editUrl:
            'https://github.com/musistudio/claude-code-router/tree/main/docs',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Disable dark mode
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },

    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Claude Code Router',
      logo: {
        alt: 'Claude Code Router Logo',
        src: 'img/ccr.svg',
        width: 32,
        height: 32,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/musistudio/claude-code-router',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} Claude Code Router. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'javascript', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
