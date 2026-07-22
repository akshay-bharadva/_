-- akshay/seed.sql
--
-- Complete portfolio seed for Akshay Bharadva, generated from akshay.md
-- against the table definitions in db/schema.sql.
--
-- Run AFTER db/schema.sql in the Supabase SQL Editor.
--
-- Tables populated (see schema.sql for definitions):
--   site_identity        (single row, UPSERTed)
--   navigation_links     (wiped + re-inserted)
--   portfolio_sections   (wiped + re-inserted; cascades to portfolio_items)
--   portfolio_items
--   blog_posts           (wiped + re-inserted; word_count is a GENERATED
--                         column — never inserted directly)
--   public_notes         (wiped + re-inserted; category respects the CHECK
--                         constraint: watching|activity|photo|thought|milestone)
--   learning_subjects /  (inserted only if the admin user exists — these are
--   learning_topics       personal tables whose RLS requires user_id = auth.uid(),
--                         so rows are pinned to the first registered user)
--
-- NEVER touched: tasks, sub_tasks, notes, events, transactions,
-- recurring_transactions, financial_goals, learning_sessions, habits,
-- habit_logs, focus_logs, inventory_items, storage_assets,
-- contact_submissions, security_settings.

BEGIN;

-- =========================================================
-- 0. CLEAR PUBLIC CONTENT
-- =========================================================
DELETE FROM portfolio_sections;   -- cascades to portfolio_items
DELETE FROM navigation_links;
DELETE FROM blog_posts;
DELETE FROM public_notes;


-- =========================================================
-- 1. SITE IDENTITY  (UPSERT — single row, id = 1)
--    schema: id, user_id, profile_data JSONB, social_links JSONB,
--            footer_data JSONB, portfolio_mode
-- =========================================================
INSERT INTO site_identity (id, profile_data, social_links, footer_data, portfolio_mode)
VALUES (
  1,
  $json$
  {
    "name": "Akshay Bharadva",
    "title": "AI Engineer",
    "description": "AI Engineer building production RAG & LLM systems · Full-stack (React, TypeScript, Python) · Cybersecurity · Toronto, ON",
    "profile_picture_url": "https://github.com/akshay-bharadva.png",
    "show_profile_picture": true,
    "default_theme": "theme-github-light",
    "typography_preset": "typo-default",
    "updates_layout": "scrapbook",
    "logo": { "main": "akshay", "highlight": ".dev" },
    "bio": [
      "Most AI projects never leave a Jupyter notebook. I build the ones that do. At Amico Corporation, I designed and deployed \"Hey Ami!\" — a voice-activated enterprise chatbot powered by RAG and PGVector that reduced routine task handling time by 30%. I also built the Complexity Matrix, an AI-driven tool that transformed how our estimators prioritize projects — replacing gut feel with data.",
      "My path here: 3 years as a full-stack developer (MERN, Spring Boot, TypeScript) → applied AI implementation → postgraduate studies in both AI and Cybersecurity at Durham College (GPA 4.78/5.00). That combination isn't accidental. I understand how to ship features, how to secure them, and how to make AI systems that non-technical users actually trust and use.",
      "What I bring to a team: end-to-end RAG pipeline design (ingestion → embedding → retrieval → LLM response), full-stack integration of AI into real products (not just model wrappers), and security-aware development — I've studied the attack surfaces, not just the benchmarks."
    ],
    "status_panel": {
      "show": true,
      "design": "minimal",
      "title": "Current Status",
      "availability": "Open to AI Engineer, LLM Developer, and applied ML roles",
      "currently_exploring": {
        "title": "Learning",
        "items": ["Advanced RAG patterns", "Agentic systems", "LLM fine-tuning"]
      },
      "latestProject": {
        "name": "Bookmarkly — local AI for bookmarks",
        "linkText": "View on GitHub",
        "href": "https://github.com/akshay-bharadva/bookmarkly"
      }
    },
    "github_projects_config": {
      "username": "akshay-bharadva",
      "show": true,
      "sort_by": "pushed",
      "exclude_forks": true,
      "exclude_archived": true,
      "exclude_profile_repo": true,
      "min_stars": 0,
      "projects_per_page": 9
    },
    "contact_page": {
      "show_contact_form": true,
      "show_availability_badge": true,
      "show_services": true
    }
  }
  $json$::jsonb,
  $json$
  [
    {"id": "github",   "label": "GitHub",   "url": "https://github.com/akshay-bharadva",      "is_visible": true},
    {"id": "linkedin", "label": "LinkedIn", "url": "https://linkedin.com/in/akshay-bharadva", "is_visible": true}
  ]
  $json$::jsonb,
  $json${ "copyright_text": "Built with Next.js & Supabase · Toronto, ON" }$json$::jsonb,
  'multi-page'
)
ON CONFLICT (id) DO UPDATE SET
  profile_data   = EXCLUDED.profile_data,
  social_links   = EXCLUDED.social_links,
  footer_data    = EXCLUDED.footer_data,
  portfolio_mode = EXCLUDED.portfolio_mode,
  updated_at     = now();


-- =========================================================
-- 2. NAVIGATION LINKS
--    schema: label, href, display_order, is_visible
-- =========================================================
INSERT INTO navigation_links (label, href, display_order, is_visible) VALUES
  ('Home',     '/',         0, true),
  ('Showcase', '/showcase', 1, true),
  ('About',    '/about',    2, true),
  ('Projects', '/projects', 3, true),
  ('Blog',     '/blog',     4, true),
  ('Updates',  '/updates',  5, true),
  ('Contact',  '/contact',  6, true);


-- =========================================================
-- 3. /  —  WHAT I BUILD  (GitHub README "What I Build")
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('What I Build', 'list_items', 0, '/', 'services', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, tags, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.tags, v.display_order
FROM s, (VALUES
  (
    'LLM Applications', 'RAG · LangChain · PGVector',
    'RAG pipelines, enterprise chatbots, and voice-activated AI interfaces — designed for production, not demos.',
    ARRAY['RAG pipelines','Chatbots','Voice AI'],
    0
  ),
  (
    'Full-Stack Products', 'React · Next.js · Spring Boot · Node',
    'React/Next.js frontends, Spring Boot and Node.js backends, PostgreSQL and MongoDB — features shipped end to end.',
    ARRAY['Frontend','Backend','Databases'],
    1
  ),
  (
    'Security Tools', 'Splunk · Wireshark · Nessus',
    'Network monitoring, port scanning, and threat detection — see Portmapper. I study the attack surfaces, not just the benchmarks.',
    ARRAY['Network monitoring','Threat detection','Port scanning'],
    2
  )
) AS v(title, subtitle, description, tags, display_order);


-- =========================================================
-- 4. /  —  NOW  ("Currently" from GitHub README)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Now', 'list_items', 1, '/', 'now-page', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, date_from, link_url, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.date_from, v.link_url, v.display_order
FROM s, (VALUES
  (
    'AI Implementation Specialist at Amico Corporation',
    'Work',
    'Shipping LLM features into enterprise workflows · Richmond Hill, ON.',
    'Updated July 2026',
    NULL,
    0
  ),
  (
    'Building Bookmarkly — local AI for organizing bookmarks',
    'Building',
    'On-device LLM inference. No cloud, no tracking.',
    NULL,
    NULL,
    1
  ),
  (
    'Advanced RAG patterns, agentic systems, LLM fine-tuning',
    'Learning',
    NULL,
    NULL,
    NULL,
    2
  ),
  (
    'Open to applied AI engineer, LLM developer, and full-stack + AI hybrid roles',
    'Thinking',
    NULL,
    NULL,
    NULL,
    3
  )
) AS v(title, subtitle, description, date_from, link_url, display_order);


-- =========================================================
-- 5. /about  —  EXPERIENCE  (all resume bullets, work-experience layout)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Experience', 'list_items', 0, '/about', 'work-experience', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, date_from, date_to, description, tags, link_url, internal_notes, display_order)
SELECT s.id, v.title, v.subtitle, v.date_from, v.date_to, v.description, v.tags, v.link_url, v.internal_notes, v.display_order
FROM s, (VALUES
  (
    'Amico Corporation', 'AI Implementation Specialist', 'Sep 2024', 'Present',
    $md$- Built and deployed "Hey Ami!" — a voice-activated LLM chatbot using RAG + PGVector, delivering context-aware real-time responses across the enterprise; reduced routine task handling time by 30%
- Engineered the Complexity Matrix tool, automating project complexity scoring for estimators and cutting project prioritization from manual judgment to data-driven decisions
- Partnered with sales and engineering to embed AI into client-facing workflows, directly reducing estimator workload on queued projects
- Designed end-to-end RAG pipelines: document ingestion, vector embedding, retrieval tuning, and LLM response generation
- Collaborated with cross-functional teams (sales, engineering, ops) to embed AI into daily workflows — not just ship a demo$md$,
    ARRAY['LangChain','PGVector','Python','RAG','OpenAI API'],
    'https://amico.ca',
    'Progression: Co-op May–Aug 2024 → Contract Sep 2024–May 2025 → Full-time Jun 2025–Present. Richmond Hill, ON.',
    0
  ),
  (
    'DigiPie Technologies LLP', 'MERN Developer', 'Dec 2022', 'Aug 2023',
    $md$- Led development of a flagship product feature that drove 20% revenue growth in Q1
- Modernized legacy codebases to MERN standards, reducing operational overhead and improving time-to-deploy
- Owned the full SDLC — from requirements through production release — across multiple concurrent client projects$md$,
    ARRAY['MongoDB','Express','React','Node.js','TypeScript'],
    NULL,
    'Gujarat, India.',
    1
  ),
  (
    'NJ Group (Finlogic Technologies)', 'Full Stack Developer', 'Nov 2021', 'Nov 2022',
    $md$- Built microservices architecture with Spring Boot, Docker, and Kubernetes, enabling independent service scaling for financial applications
- Developed SQL/PL/SQL components (views, functions, triggers) optimizing database performance for high-volume financial data
- Created unit test suites and POCs that accelerated design decisions and reduced rework cycles$md$,
    ARRAY['Spring Boot','Java','Docker','Kubernetes','PL/SQL'],
    NULL,
    'Gujarat, India.',
    2
  )
) AS v(title, subtitle, date_from, date_to, description, tags, link_url, internal_notes, display_order);


-- =========================================================
-- 6. /about  —  STACK  (full inventory from GitHub README,
--    grouped by category via the `uses` layout)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Stack', 'list_items', 1, '/about', 'uses', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.display_order
FROM s, (VALUES
  -- AI stack
  ('LangChain',        'AI Stack', 'RAG orchestration for Hey Ami! in production.',          0),
  ('PyTorch',          'AI Stack', 'Model training and fine-tuning workflows.',              1),
  ('Hugging Face',     'AI Stack', 'Transformers and NLP pipelines.',                        2),
  ('PGVector',         'AI Stack', 'Vector storage and similarity search in Postgres.',      3),
  ('OpenAI API',       'AI Stack', 'LLM integration (GPT) for enterprise responses.',        4),
  ('RAG',              'AI Stack', 'Ingestion → embedding → retrieval → response.',          5),
  -- Languages
  ('Python',           'Languages', 'Primary language for AI services and tooling.',         6),
  ('TypeScript',       'Languages', 'Typed full-stack product code.',                        7),
  ('Java',             'Languages', 'Spring Boot microservices and enterprise backends.',    8),
  ('SQL',              'Languages', 'Views, functions, triggers for high-volume data.',      9),
  -- Frontend
  ('React',            'Frontend', 'Component-driven product UIs.',                          10),
  ('Next.js',          'Frontend', 'Full-stack React with SSR/SSG.',                         11),
  ('TailwindCSS',      'Frontend', 'Design systems and responsive UI.',                      12),
  -- Backend
  ('Spring Boot',      'Backend', 'Microservices for financial applications.',               13),
  ('Flask',            'Backend', 'Lightweight Python APIs.',                                14),
  ('Node.js',          'Backend', 'REST APIs and full-stack MERN work.',                     15),
  ('Docker',           'Backend', 'Containerized deployment; Kubernetes orchestration.',     16),
  ('PostgreSQL',       'Backend', 'Primary relational database (+ PGVector).',               17),
  ('MongoDB',          'Backend', 'Document storage in MERN stacks.',                        18),
  -- Security
  ('Splunk',           'Security', 'Log analysis and security monitoring.',                  19),
  ('Wireshark',        'Security', 'Network protocol and traffic analysis.',                 20),
  ('Nessus',           'Security', 'Vulnerability scanning and assessment.',                 21),
  ('Snort',            'Security', 'Intrusion detection.',                                   22),
  ('PFsense',          'Security', 'Firewalling and network defence.',                       23),
  ('Metasploit',       'Security', 'Penetration testing framework.',                         24),
  ('Zabbix',           'Security', 'Infrastructure monitoring.',                             25)
) AS v(title, subtitle, description, display_order);


-- =========================================================
-- 7. /about  —  SKILL LEVELS  (resume Expert/Proficient/Familiar)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Skill Levels', 'list_items', 2, '/about', 'compact-cards', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, display_order)
SELECT s.id, v.title, v.subtitle, v.display_order
FROM s, (VALUES
  -- Expert
  ('Python',                     'Expert', 0),
  ('RAG',                        'Expert', 1),
  ('LangChain',                  'Expert', 2),
  ('PGVector',                   'Expert', 3),
  ('LLM integration (GPT/OpenAI)', 'Expert', 4),
  ('ReactJS',                    'Expert', 5),
  ('NextJS',                     'Expert', 6),
  ('TypeScript',                 'Expert', 7),
  ('SQL',                        'Expert', 8),
  -- Proficient
  ('PyTorch',                    'Proficient', 9),
  ('Hugging Face Transformers',  'Proficient', 10),
  ('NLP',                        'Proficient', 11),
  ('scikit-learn',               'Proficient', 12),
  ('Spring Boot',                'Proficient', 13),
  ('Docker',                     'Proficient', 14),
  ('REST API design',            'Proficient', 15),
  ('PostgreSQL',                 'Proficient', 16),
  ('MongoDB',                    'Proficient', 17),
  -- Familiar
  ('AWS',                        'Familiar', 18),
  ('Azure',                      'Familiar', 19),
  ('Kubernetes',                 'Familiar', 20),
  ('Splunk',                     'Familiar', 21),
  ('Wireshark',                  'Familiar', 22),
  ('Nessus',                     'Familiar', 23),
  ('Metasploit',                 'Familiar', 24),
  ('PFsense',                    'Familiar', 25),
  ('Snort',                      'Familiar', 26),
  ('Zabbix',                     'Familiar', 27)
) AS v(title, subtitle, display_order);


-- =========================================================
-- 8. /about  —  EDUCATION  (all three credentials + curricula)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Education', 'list_items', 3, '/about', 'timeline', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, date_from, date_to, description, tags, display_order)
SELECT s.id, v.title, v.subtitle, v.date_from, v.date_to, v.description, v.tags, v.display_order
FROM s, (VALUES
  (
    'Postgraduate Certificate, Cybersecurity',
    'Durham College · Oshawa, ON',
    'Sep 2024', 'Apr 2025',
    $md$Ontario College Graduate Certificate. Network Monitoring, Penetration Testing, Access Controls, Security Auditing & Governance.

Coursework included: Network Systems and Components, Wireless Network Security, Information Security, Operating System Security, Law and Ethics in Forensic Investigations, Business Processes and Security Policy.$md$,
    ARRAY['Penetration Testing','Network Security','Security Auditing'],
    0
  ),
  (
    'Postgraduate Certificate, Artificial Intelligence Analysis, Design & Implementation',
    'Durham College · Oshawa, ON',
    'Sep 2023', 'Aug 2024',
    $md$**GPA 4.78 / 5.00.** AI Algorithms, NLP, Predictive Modeling, Enterprise AI Systems.

Coursework included: Studies in Artificial Intelligence, Visualisation and Data Storytelling, AI Algorithms I, Applied Mathematics for AI Systems, Applied Machine Learning and Advanced AI Systems, Knowledge and Expert Systems, AI in Enterprise Systems, and two Capstone terms.$md$,
    ARRAY['AI Algorithms','NLP','Predictive Modeling','GPA 4.78/5.00'],
    1
  ),
  (
    'Bachelor of Computer Applications',
    'Veer Narmad South Gujarat University',
    'Jun 2019', 'Apr 2022',
    'CGPA 8.7 / 10.',
    ARRAY['CGPA 8.7/10'],
    2
  )
) AS v(title, subtitle, date_from, date_to, description, tags, display_order);


-- =========================================================
-- 9. /about  —  OPEN SOURCE  (SigNoz)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Open Source', 'list_items', 4, '/about', 'open-source', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, link_url, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.link_url, v.display_order
FROM s, (VALUES
  (
    'signoz/signoz',
    'ReactJS Contributor · Apr 2023 – Oct 2023',
    'Rewrote the Pricing and product comparison pages (vs. Datadog, New Relic, Dynatrace, Grafana). Led rebranding of the main landing page using Docusaurus, ReactJS, and TailwindCSS for a top open-source APM tool.',
    'https://github.com/signoz/signoz',
    0
  )
) AS v(title, subtitle, description, link_url, display_order);


-- =========================================================
-- 10. /showcase  —  CASE STUDIES  (Hey Ami! + Complexity Matrix)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Case Studies', 'list_items', 0, '/showcase', 'case-study', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, date_from, date_to, description, tags, link_url, display_order)
SELECT s.id, v.title, v.subtitle, v.date_from, v.date_to, v.description, v.tags, v.link_url, v.display_order
FROM s, (VALUES
  (
    $txt$"Hey Ami!" — Voice-Activated Enterprise RAG Chatbot$txt$,
    'Reduced routine task handling time by 30% across sales and ops teams',
    'May 2024', 'Present',
    $md$Sales and operations teams at Amico were losing hours to routine lookups scattered across enterprise systems, with no unified way to ask a question and get a trustworthy answer.

- Designed the end-to-end RAG pipeline: document ingestion → vector embedding (PGVector) → retrieval tuning → LLM response generation
- Added a voice-activated interface delivering context-aware, real-time responses so non-technical users could just *ask*
- Iterated on prompt engineering and retrieval quality with real user feedback until answers were trusted enough to replace manual lookups
- Deployed and owned the system in production across the enterprise$md$,
    ARRAY['30% less routine task time','RAG LangChain + PGVector','Voice activated interface'],
    'https://amico.ca',
    0
  ),
  (
    'Complexity Matrix — AI-Driven Project Scoring',
    'Cut project prioritization from manual judgment to data-driven decisions',
    'Sep 2024', 'Mar 2025',
    $md$Estimators prioritized incoming projects by gut feel — inconsistent, hard to audit, and prone to burying high-value work in the queue.

- Built AI-driven complexity scoring over historical project data
- Automated estimator workflow prioritization, surfacing scores inside the existing workflow so adoption required zero process change
- Directly reduced estimator workload on queued projects$md$,
    ARRAY['100% queue coverage','0 process changes','AI complexity scoring'],
    'https://amico.ca',
    1
  )
) AS v(title, subtitle, date_from, date_to, description, tags, link_url, display_order);


-- =========================================================
-- 11. /showcase  —  BY THE NUMBERS
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('By the Numbers', 'list_items', 1, '/showcase', 'impact-numbers', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.display_order
FROM s, (VALUES
  ('30%',  'faster task handling',  'via the Hey Ami! RAG chatbot',       0),
  ('20%',  'revenue growth in Q1',  'from one flagship feature',          1),
  ('4+',   'years in production',   'full-stack to LLM systems',          2),
  ('4.78', 'GPA / 5.00',            'Durham College AI postgrad',         3),
  ('8.7',  'CGPA / 10',             'Bachelor of Computer Applications',  4),
  ('3',    'credentials',           'BCA + AI + Cybersecurity postgrads', 5)
) AS v(title, subtitle, description, display_order);


-- =========================================================
-- 12. /projects  —  FEATURED PROJECTS  (all pinned repos)
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('Projects', 'list_items', 0, '/projects', 'grid-2-col', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, link_url, tags, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.link_url, v.tags, v.display_order
FROM s, (VALUES
  (
    'Bookmarkly', 'Local AI for your bookmarks',
    'Auto-organizes browser bookmarks using on-device LLM inference — no cloud, no data leaves your machine. Python, MIT licensed. AI-native thinking, shipped.',
    'https://github.com/akshay-bharadva/bookmarkly',
    ARRAY['Python','Local LLM','AI','MIT'],
    0
  ),
  (
    'Portmapper', 'Network security monitoring',
    'Network security monitoring platform for real-time port scanning and threat detection. A unique security angle that shows depth beyond the AI stack. Python.',
    'https://github.com/akshay-bharadva/portmapper',
    ARRAY['Python','Security','Networking'],
    1
  ),
  (
    'Template Management System', 'Dynamic PDF generation',
    'Java/Spring MVC web app for generating dynamic PDFs from custom templates with data placeholders — real backend depth on a real project.',
    'https://github.com/akshay-bharadva/template-management-system',
    ARRAY['Java','Spring MVC','PDF'],
    2
  ),
  (
    'Memories', 'Full-stack MERN app',
    'A memories-sharing app built on the MERN stack — full-stack competency from MongoDB schema to responsive React UI.',
    'https://github.com/akshay-bharadva/memories',
    ARRAY['MongoDB','Express','React','Node.js'],
    3
  ),
  (
    'Myntra Product Scraping', 'Data engineering with Selenium',
    'Python + Selenium scraper for Myntra product data — the data engineering instinct behind the AI work.',
    'https://github.com/akshay-bharadva/myntra-product-scrapping',
    ARRAY['Python','Selenium','Data Engineering'],
    4
  ),
  (
    'Web Projects & React Movie', 'Frontend fluency',
    'A collection of frontend builds — including a React movie browser — demonstrating day-to-day fluency in modern UI work.',
    'https://github.com/akshay-bharadva/web-projects',
    ARRAY['React','JavaScript','CSS'],
    5
  )
) AS v(title, subtitle, description, link_url, tags, display_order);


-- =========================================================
-- 13. /contact  —  SERVICES  ("What I bring to a team")
-- =========================================================
WITH s AS (
  INSERT INTO portfolio_sections (title, type, display_order, page_path, layout_style, is_visible)
  VALUES ('What I Bring', 'list_items', 0, '/contact', 'services', true)
  RETURNING id
)
INSERT INTO portfolio_items (section_id, title, subtitle, description, tags, display_order)
SELECT s.id, v.title, v.subtitle, v.description, v.tags, v.display_order
FROM s, (VALUES
  (
    'End-to-End RAG Pipeline Design', 'Ingestion → Embedding → Retrieval → Response',
    'Complete RAG system design and production deployment — the pipeline behind "Hey Ami!" from document ingestion through vector storage, retrieval tuning, and prompt engineering.',
    ARRAY['RAG','LangChain','PGVector','Prompt engineering'],
    0
  ),
  (
    'AI Integrated Into Real Products', 'Not just model wrappers',
    'Full-stack integration of AI into products people actually use — React/Next.js frontends, Spring Boot/Node backends, and the glue that makes non-technical users trust the system.',
    ARRAY['Full-stack','React','Next.js','Node.js'],
    1
  ),
  (
    'Security-Aware Development', $txt$I've studied the attack surfaces$txt$,
    $txt$AI that ships, scales, and doesn't get compromised. Postgraduate cybersecurity training: network monitoring, penetration testing, access controls, and security auditing.$txt$,
    ARRAY['Threat detection','Pen testing','Security auditing'],
    2
  )
) AS v(title, subtitle, description, tags, display_order);


-- =========================================================
-- 14. BLOG POSTS  (drafts from the creator strategy — one per
--     planned topic; publish each when written)
--     schema: word_count is GENERATED — not inserted.
-- =========================================================
INSERT INTO blog_posts (title, slug, excerpt, content, published, published_at, show_toc, tags, internal_notes) VALUES
(
  $txt$RAG Lessons from Shipping "Hey Ami!" to Production$txt$,
  'rag-lessons-from-shipping-hey-ami',
  $txt$Most RAG advice comes from demos. Here's what actually mattered when a voice chatbot had to answer real questions for real teams every day.$txt$,
  $md$## Draft outline

## The gap between a RAG demo and a RAG product

## Retrieval quality is the product

- Chunking strategy gotchas
- PGVector tuning that actually moved the needle

## Prompt engineering with non-technical users in the loop

## What I'd do differently next time$md$,
  false, NULL, true,
  ARRAY['RAG','LangChain','PGVector','LLM'],
  'From creator strategy: "A lesson learned building Hey Ami! (RAG gotchas, PGVector tuning, prompt engineering)". Flesh out, then publish.'
),
(
  'Portmapper: Building a Network Security Monitor in Python',
  'portmapper-network-security-monitor-python',
  'A breakdown of Portmapper — real-time port scanning and threat detection, and what building it taught me about attack surfaces.',
  $md$## Draft outline

## Why build a port scanner in 2025

## Architecture: scanning, detection, alerting

## What the cybersecurity postgrad changed about my approach

## Where it goes next$md$,
  false, NULL, true,
  ARRAY['Python','Security','Networking'],
  'From creator strategy: "A breakdown of Portmapper or Bookmarkly". Flesh out, then publish.'
),
(
  'Bookmarkly: Local AI Without the Cloud',
  'bookmarkly-local-ai-without-the-cloud',
  'Why I built an on-device LLM tool to organize bookmarks — and what local inference is actually like in practice.',
  $md$## Draft outline

## The case for local-first AI

## On-device LLM inference: constraints and tricks

## Auto-organizing bookmarks: the pipeline

## Lessons for anyone building local AI tools$md$,
  false, NULL, true,
  ARRAY['Local LLM','Python','AI'],
  'From creator strategy: "A breakdown of Portmapper or Bookmarkly". Flesh out, then publish.'
);


-- =========================================================
-- 15. PUBLIC NOTES  (Life Updates — career milestones)
--     schema CHECK: category IN (watching, activity, photo, thought, milestone)
-- =========================================================
INSERT INTO public_notes (title, content, category, tags, is_pinned, is_published) VALUES
(
  $txt$Deployed "Hey Ami!" at Amico 🚀$txt$,
  'Voice-activated enterprise RAG chatbot, live in production. Routine task handling time down 30% across sales and ops. Most AI projects never leave a Jupyter notebook — this one did.',
  'milestone',
  ARRAY['RAG','LLM','Production'],
  true,  true
),
(
  'Full-time at Amico Corporation',
  'Co-op → contract → full-time. The AI Implementation Specialist role is now permanent as of June 2025. Shipping LLM features into enterprise workflows every week.',
  'milestone',
  ARRAY['Career','Amico'],
  false, true
),
(
  'Completed Cybersecurity postgrad at Durham College',
  $txt$Second postgraduate certificate done — network monitoring, penetration testing, security auditing. AI + security is a rare combination and that's the point.$txt$,
  'milestone',
  ARRAY['Cybersecurity','Durham College'],
  false, true
),
(
  'Graduated the Durham College AI program with a 4.78/5.00 GPA',
  'AI Algorithms, NLP, Predictive Modeling, Enterprise AI Systems — and two capstone terms. The bridge from full-stack developer to AI engineer.',
  'milestone',
  ARRAY['AI','Durham College','GPA 4.78'],
  false, true
),
(
  'Building Bookmarkly',
  'Local AI that organizes your bookmarks with on-device LLM inference. No cloud, no tracking — your browsing habits stay yours.',
  'activity',
  ARRAY['Local LLM','Python','Side project'],
  false, true
),
(
  'Contributed to SigNoz',
  'Rewrote the pricing and comparison pages and led the landing page rebrand for one of the top open-source APM tools. Docusaurus + ReactJS + TailwindCSS.',
  'milestone',
  ARRAY['Open Source','SigNoz','ReactJS'],
  false, true
);


-- =========================================================
-- 16. LEARNING HUB  (learning_subjects + learning_topics)
--     Personal tables: RLS requires user_id = auth.uid(), so rows are
--     pinned to the admin (first registered user). Skipped automatically
--     if no user exists yet — re-run the script after creating the
--     admin account to pick these up.
-- =========================================================
WITH admin_user AS (
  SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1
),
subj AS (
  INSERT INTO learning_subjects (user_id, name, description)
  SELECT admin_user.id, v.name, v.description
  FROM admin_user, (VALUES
    ('Applied LLM Engineering',
     'Advanced RAG patterns, agentic systems, and LLM fine-tuning — the "Currently learning" track.')
  ) AS v(name, description)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id, user_id
)
INSERT INTO learning_topics (user_id, subject_id, title, status, core_notes)
SELECT subj.user_id, subj.id, v.title, v.status::learning_status, v.core_notes
FROM subj, (VALUES
  ('Advanced RAG patterns', 'Learning',
   'Beyond naive retrieval: query rewriting, re-ranking, hybrid search, and evaluation.'),
  ('Agentic systems', 'Learning',
   'Multi-step tool-using agents; planning, memory, and guardrails.'),
  ('LLM fine-tuning', 'To Learn',
   'LoRA/QLoRA workflows; when fine-tuning beats retrieval and prompting.')
) AS v(title, status, core_notes);


COMMIT;

-- =========================================================
-- SANITY CHECK  (optional — run after commit)
-- =========================================================
-- SELECT 'navigation_links'  AS tbl, count(*) FROM navigation_links   UNION ALL  --  7
-- SELECT 'portfolio_sections',       count(*) FROM portfolio_sections UNION ALL  -- 11
-- SELECT 'portfolio_items',          count(*) FROM portfolio_items    UNION ALL  -- 85
-- SELECT 'blog_posts',               count(*) FROM blog_posts         UNION ALL  --  3 (drafts)
-- SELECT 'public_notes',             count(*) FROM public_notes       UNION ALL  --  6
-- SELECT 'learning_subjects',        count(*) FROM learning_subjects  UNION ALL  --  1 (if admin exists)
-- SELECT 'learning_topics',          count(*) FROM learning_topics;              --  3 (if admin exists)
