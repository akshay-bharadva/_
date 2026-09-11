// =============================================================================
// FOLIOKIT - Portfolio Configuration — Akshay Bharadva
// Generated from akshay.md. To use: replace the root portfolio.config.ts
// with this file (or copy its values over).
// =============================================================================

const portfolioConfig = {
  // ---------------------------------------------------------------------------
  // IDENTITY
  // ---------------------------------------------------------------------------
  name: "Akshay Bharadva",
  title: "AI Engineer",
  description:
    "Production RAG & LLM systems, full-stack products and security-aware engineering — from first prototype to deployed, and used by the people it was built for.",

  // The one line a visitor should leave with: the home page's main heading,
  // with your name as the byline under it. Leave empty to lead with your name.
  headline: "Most AI projects never leave a notebook. I build the ones that do.",

  // Results you can stand behind, shown as a strip under the hero (up to 4).
  // A figure a client can check beats any adjective.
  proof: [
    { value: "30%", label: "less time on routine tasks with the “Hey Ami!” assistant" },
    { value: "20%", label: "Q1 revenue growth from a flagship feature I led" },
    { value: "3 yrs", label: "shipping full-stack products before moving into AI" },
    { value: "2", label: "postgraduate certificates — AI and cybersecurity" },
  ],
  profilePicture: "https://github.com/akshay-bharadva.png",
  showProfilePicture: true,

  logo: {
    main: "akshay",
    highlight: ".dev",
  },

  bio: [
    'At Amico Corporation, I designed and deployed "Hey Ami!" — a voice-activated enterprise chatbot powered by RAG and PGVector that reduced routine task handling time by 30%. I also built the Complexity Matrix, an AI-driven tool that transformed how our estimators prioritize projects — replacing gut feel with data.',
    "My path here: 3 years as a full-stack developer (MERN, Spring Boot, TypeScript) → applied AI implementation → postgraduate studies in both AI and Cybersecurity at Durham College (GPA 4.78/5.00). That combination isn't accidental. I understand how to ship features, how to secure them, and how to make AI systems that non-technical users actually trust and use.",
  ],

  // ---------------------------------------------------------------------------
  // THEME
  // ---------------------------------------------------------------------------
  defaultTheme: "theme-github-light",
  typographyPreset: "typo-default",
  portfolioMode: "multi-page" as const,

  // ---------------------------------------------------------------------------
  // STATUS PANEL
  // ---------------------------------------------------------------------------
  statusPanel: {
    show: true,
    design: "minimal" as const,
    title: "Current Status",
    availability: "Open to AI Engineer / LLM Developer roles",
    currentlyExploring: {
      title: "Learning",
      items: ["Advanced RAG patterns", "Agentic systems", "LLM fine-tuning"],
    },
    latestProject: {
      name: "Bookmarkly — local AI for bookmarks",
      linkText: "View on GitHub",
      href: "https://github.com/akshay-bharadva/bookmarkly",
    },
  },

  // ---------------------------------------------------------------------------
  // SOCIAL LINKS
  // ---------------------------------------------------------------------------
  socialLinks: [
    { id: "github", label: "GitHub", url: "https://github.com/akshay-bharadva" },
    {
      id: "linkedin",
      label: "LinkedIn",
      url: "https://linkedin.com/in/akshay-bharadva",
    },
  ],

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------
  footerText: "Built with Next.js & Supabase · Toronto, ON",

  // ---------------------------------------------------------------------------
  // GITHUB PROJECTS
  // ---------------------------------------------------------------------------
  github: {
    username: "akshay-bharadva",
    show: true,
    sortBy: "pushed" as const,
    excludeForks: true,
    excludeArchived: true,
    excludeProfileRepo: true,
    minStars: 0,
    projectsPerPage: 6,
  },

  // ---------------------------------------------------------------------------
  // CONTACT PAGE
  // ---------------------------------------------------------------------------
  contact: {
    showContactForm: true,
    showAvailabilityBadge: true,
    showServices: true,
  },

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------
  navLinks: [
    { label: "Home", href: "/" },
    { label: "Showcase", href: "/showcase" },
    { label: "About", href: "/about" },
    { label: "Projects", href: "/projects" },
    { label: "Blog", href: "/blog" },
    { label: "Updates", href: "/updates" },
    { label: "Foliokit", href: "/kit" },
    { label: "Contact", href: "/contact" },
  ],

  // ---------------------------------------------------------------------------
  // EXPERIENCE
  // ---------------------------------------------------------------------------
  experience: [
    {
      title: "AI Implementation Specialist",
      company: "Amico Corporation",
      from: "Sep 2024",
      to: "Present",
      description:
        'Built and deployed "Hey Ami!" — a voice-activated RAG chatbot using LangChain + PGVector; cut routine task handling time by 30% across sales and ops. Engineered the Complexity Matrix, an AI-powered project scoring tool. Owned the full pipeline: ingestion, vector storage, retrieval tuning, prompt engineering, and production deployment.',
      tags: ["LangChain", "PGVector", "Python", "RAG", "OpenAI API"],
    },
    {
      title: "MERN Developer",
      company: "DigiPie Technologies LLP",
      from: "Dec 2022",
      to: "Aug 2023",
      description:
        "Led development of a flagship product feature that drove 20% revenue growth in Q1. Modernized legacy codebases to MERN standards. Owned the full SDLC across multiple concurrent client projects.",
      tags: ["MongoDB", "Express", "React", "Node.js", "TypeScript"],
    },
    {
      title: "Full Stack Developer",
      company: "NJ Group (Finlogic Technologies)",
      from: "Nov 2021",
      to: "Nov 2022",
      description:
        "Built microservices with Spring Boot, Docker, and Kubernetes for scalable financial applications. Developed SQL/PL/SQL components optimizing high-volume financial data. Created unit test suites and POCs that reduced rework.",
      tags: ["Spring Boot", "Java", "Docker", "Kubernetes", "PL/SQL"],
    },
  ],

  // ---------------------------------------------------------------------------
  // TECH STACK
  // ---------------------------------------------------------------------------
  techStack: [
    { title: "RAG / LangChain", description: "Ingestion → embedding → retrieval tuning → LLM response" },
    { title: "Python", description: "Production AI services, tooling, and data pipelines" },
    { title: "TypeScript / React / Next.js", description: "Full-stack product frontends" },
    { title: "PGVector / PostgreSQL", description: "Vector search, schema design, high-volume data" },
    { title: "PyTorch / Hugging Face", description: "Model fine-tuning and NLP workflows" },
    { title: "Docker & Spring Boot", description: "Microservices, containerization, backend depth" },
  ],

  // ---------------------------------------------------------------------------
  // TOOLS
  // ---------------------------------------------------------------------------
  tools: [
    { title: "Splunk", description: "Log analysis and security monitoring." },
    { title: "Wireshark", description: "Network protocol analysis — attack surfaces, not just benchmarks." },
    { title: "Nessus", description: "Vulnerability scanning and assessment." },
    { title: "PFsense / Snort", description: "Firewalling and intrusion detection." },
  ],

  // ---------------------------------------------------------------------------
  // EDUCATION
  // ---------------------------------------------------------------------------
  education: [
    {
      title: "Postgraduate Certificate, Cybersecurity",
      institution: "Durham College",
      from: "Sep 2024",
      to: "Apr 2025",
      description:
        "Network Monitoring, Penetration Testing, Access Controls, Security Auditing & Governance.",
    },
    {
      title: "Postgraduate Certificate, AI Analysis, Design & Implementation",
      institution: "Durham College",
      from: "Sep 2023",
      to: "Aug 2024",
      description:
        "GPA 4.78 / 5.00 · AI Algorithms, NLP, Predictive Modeling, Enterprise AI Systems.",
    },
    {
      title: "Bachelor of Computer Applications",
      institution: "Veer Narmad South Gujarat University",
      from: "Jun 2019",
      to: "Apr 2022",
      description: "CGPA 8.7 / 10.",
    },
  ],

  // ---------------------------------------------------------------------------
  // SHOWCASE
  // ---------------------------------------------------------------------------
  showcase: [
    {
      title: '"Hey Ami!" — Voice-Activated Enterprise RAG Chatbot',
      description:
        "End-to-end RAG pipeline (LangChain + PGVector) with a voice interface, deployed to production at Amico Corporation. Reduced routine task handling time by 30% across sales and ops teams.",
      link: "https://amico.ca",
      tags: ["RAG", "LangChain", "PGVector", "Voice AI"],
    },
    {
      title: "Complexity Matrix — AI Project Scoring",
      description:
        "AI-driven complexity scoring that moved estimator prioritization from gut feel to data — embedded directly into the existing workflow so adoption required zero process change.",
      link: "https://amico.ca",
      tags: ["Applied AI", "Decision Support", "Python"],
    },
  ],

  // ---------------------------------------------------------------------------
  // FEATURED PROJECTS
  // ---------------------------------------------------------------------------
  projects: [
    {
      title: "Bookmarkly",
      subtitle: "Local AI for your bookmarks",
      description:
        "Auto-organizes browser bookmarks using on-device LLM inference — no cloud, no data leaves your machine. Python, MIT licensed.\n\n[View Source on GitHub](https://github.com/akshay-bharadva/bookmarkly)",
      tags: ["Python", "Local LLM", "AI"],
      link: "https://github.com/akshay-bharadva/bookmarkly",
      image: "",
    },
    {
      title: "Portmapper",
      subtitle: "Network security monitoring",
      description:
        "Real-time port scanning and threat detection platform. Security depth meets practical tooling.\n\n[View Source on GitHub](https://github.com/akshay-bharadva/portmapper)",
      tags: ["Python", "Security", "Networking"],
      link: "https://github.com/akshay-bharadva/portmapper",
      image: "",
    },
    {
      title: "Template Management System",
      subtitle: "Dynamic PDF generation",
      description:
        "Java/Spring MVC web app for generating dynamic PDFs from custom templates with data placeholders.\n\n[View Source on GitHub](https://github.com/akshay-bharadva/template-management-system)",
      tags: ["Java", "Spring MVC", "PDF"],
      link: "https://github.com/akshay-bharadva/template-management-system",
      image: "",
    },
  ],

  // ---------------------------------------------------------------------------
  // SERVICES
  // ---------------------------------------------------------------------------
  services: [
    {
      title: "LLM & RAG Systems",
      subtitle: "LangChain · PGVector · OpenAI API",
      description:
        "End-to-end RAG pipeline design — ingestion, embedding, retrieval tuning, and LLM response generation. Built for production, not demos.",
      tags: ["RAG pipelines", "Chatbots", "Voice AI", "Prompt engineering"],
    },
    {
      title: "Full-Stack Products",
      subtitle: "React · Next.js · Spring Boot · Node",
      description:
        "AI integrated into real products — not just model wrappers. Frontend, backend, database, and deployment handled end to end.",
      tags: ["Web apps", "APIs", "Auth", "Deployment"],
    },
    {
      title: "Security-Aware Engineering",
      subtitle: "Splunk · Wireshark · Nessus",
      description:
        "I've studied the attack surfaces, not just the benchmarks. AI systems that ship, scale, and don't get compromised.",
      tags: ["Threat detection", "Network security", "Audits"],
    },
  ],

  // ---------------------------------------------------------------------------
  // PROCESS — "How I work" on the home page
  // ---------------------------------------------------------------------------
  process: [
    {
      title: "Discovery call",
      duration: "30 minutes",
      description:
        "What you're trying to change, what you have today, and whether AI is the right tool for it at all.",
    },
    {
      title: "Scoped proposal",
      duration: "A few days",
      description:
        "A written plan: the smallest version worth shipping, what it takes, and how we'll know it worked.",
    },
    {
      title: "Build in the open",
      duration: "Weekly demos",
      description:
        "Working software every week against your real data, so you can steer while changes are still cheap.",
    },
    {
      title: "Ship and hand over",
      duration: "Launch",
      description:
        "Deployed, monitored and documented — with your team able to run it without me.",
    },
  ],

  // ---------------------------------------------------------------------------
  // BLOG POSTS
  // ---------------------------------------------------------------------------
  blogPosts: [
    {
      title: 'RAG Lessons from Shipping "Hey Ami!" to Production',
      slug: "rag-lessons-from-shipping-hey-ami",
      excerpt:
        "Most RAG advice comes from demos. Here's what actually mattered when a voice chatbot had to answer real questions for real teams every day.",
      content:
        "## Draft outline\n\n## The gap between a RAG demo and a RAG product\n\n## Retrieval quality is the product\n\n- Chunking strategy gotchas\n- PGVector tuning that actually moved the needle\n\n## Prompt engineering with non-technical users in the loop\n\n## What I'd do differently next time",
      tags: ["RAG", "LangChain", "PGVector", "LLM"],
      showToc: true,
    },
  ],

  // ---------------------------------------------------------------------------
  // LIFE UPDATES
  // ---------------------------------------------------------------------------
  updatesLayout: "scrapbook" as const,

  lifeUpdates: [
    {
      title: 'Deployed "Hey Ami!" at Amico 🚀',
      content:
        "Voice-activated enterprise RAG chatbot, live in production. Routine task handling time down 30% across sales and ops. Most AI projects never leave a Jupyter notebook — this one did.",
      category: "milestone" as const,
      tags: ["RAG", "LLM", "Production"],
      isPinned: true,
    },
    {
      title: "Completed Cybersecurity postgrad at Durham College",
      content:
        "Second postgraduate certificate done — network monitoring, penetration testing, security auditing. AI + security is a rare combination and that's the point.",
      category: "milestone" as const,
      tags: ["Cybersecurity", "Durham College"],
      isPinned: false,
    },
    {
      title: "Building Bookmarkly",
      content:
        "Local AI that organizes your bookmarks with on-device LLM inference. No cloud, no tracking — your browsing habits stay yours.",
      category: "activity" as const,
      tags: ["Local LLM", "Python", "Side project"],
      isPinned: false,
    },
  ],

  // ---------------------------------------------------------------------------
  // PRODUCT — the /kit page that sells Foliokit itself
  // ---------------------------------------------------------------------------
  // `show: false` removes /kit and the footer credit — what a site built *with*
  // Foliokit usually wants. Prices are yours to set; nothing here is invented.
  product: {
    show: true,
    name: "Foliokit",
    repoUrl: "https://github.com/akshay-bharadva/foliokit",
    plans: [
      {
        name: "Open source",
        price: "Free",
        period: "MIT licence",
        description:
          "Everything in the repository, to run on your own accounts.",
        features: [
          "Portfolio, blog and page builder",
          "The whole private workspace",
          "Every theme and type pairing",
          "Free static hosting",
        ],
        cta: {
          label: "Get it on GitHub",
          href: "https://github.com/akshay-bharadva/foliokit",
        },
        highlighted: false,
      },
      {
        name: "Done for you",
        price: "Let's talk",
        period: "one-off setup",
        description:
          "I set it up on your domain with your content, theme and Supabase, and walk you through it.",
        features: [
          "Deployed on your domain",
          "Your content moved in",
          "Supabase, storage and two-factor configured",
          "A walkthrough of the workspace",
        ],
        cta: { label: "Book a setup", href: "/contact" },
        highlighted: true,
      },
    ],
  },
};

export default portfolioConfig;
