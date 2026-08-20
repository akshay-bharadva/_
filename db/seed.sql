-- ============================================================================
-- seed.sql — Akshay Bharadva's production data
-- ============================================================================
--
-- Run once, after schema.sql and every migration. Safe to re-run: every insert
-- is guarded, so a second run changes nothing rather than duplicating a career.
--
-- ── The one thing that will bite you ───────────────────────────────────────
--
-- `auth.uid()` is NULL in the Supabase SQL editor. It runs as the service
-- role, so any row left to the column default is owned by nobody — invisible
-- to the app and to RLS alike, which looks exactly like the seed silently
-- failing. Every insert below therefore takes `user_id` from the first
-- `auth.users` row, the same rule `is_admin()` uses.
--
-- **Create your admin account before running this.** With no rows in
-- auth.users the script raises rather than writing orphans.
--
-- ── What is here ──────────────────────────────────────────────────────────
--
-- The portfolio is real: roles, dates and numbers from LinkedIn, GitHub and
-- Upwork. The workspace data — tasks, habits, learning, notes, calendar — is
-- plausible working material built around the actual projects, so the modules
-- have something true-shaped to render rather than "Lorem ipsum 1".
--
-- Finance is real too: the accounts, the biweekly pay, the rent, the car
-- insurance, the cat. Opening balances are stated as at the opening date and
-- the ledger is deliberately short — this is a starting point to keep adding
-- to, not a reconstructed history.

DO $$
DECLARE
  uid            UUID;
  today          DATE := CURRENT_DATE;

  -- Portfolio sections
  sec_about      UUID;
  sec_exp        UUID;
  sec_projects   UUID;
  sec_skills     UUID;
  sec_edu        UUID;

  -- Finance
  acc_rbc_cheq   UUID;
  acc_rbc_save   UUID;
  acc_rbc_tfsa   UUID;
  acc_rbc_rrsp   UUID;
  acc_cibc_cheq  UUID;
  acc_cibc_save  UUID;
  acc_credit     UUID;
  cat_salary     UUID;
  cat_rent       UUID;
  cat_transport  UUID;
  cat_pet        UUID;
  cat_grocery    UUID;
  cat_dining     UUID;
  cat_subs       UUID;
  cat_savings    UUID;
  cat_transfer   UUID;

  -- Workspace
  proj_foliokit  UUID;
  proj_spyglass  UUID;
  proj_career    UUID;
  proj_life      UUID;
  subj_ai        UUID;
  subj_sec       UUID;
  subj_sys       UUID;
  cal_work       UUID;
  cal_personal   UUID;
  cal_learning   UUID;
  t_id           UUID;
BEGIN
  SELECT id INTO uid FROM auth.users ORDER BY created_at LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION
      'No user in auth.users. Sign up in the app first, then run this — otherwise every row here would be owned by nobody and invisible to RLS.';
  END IF;

  -- ==========================================================================
  -- 1. IDENTITY
  -- ==========================================================================

  INSERT INTO site_identity (id, user_id, profile_data, social_links, footer_data, portfolio_mode)
  VALUES (
    1, uid,
    jsonb_build_object(
      'name', 'Akshay Bharadva',
      'title', 'AI Engineer',
      'tagline', 'Building production LLM and RAG systems',
      'bio', 'AI Implementation Specialist at Amico Group. I build retrieval systems that people actually use every day — most recently "Hey Ami!", a voice-activated enterprise assistant over 300+ internal documents that cut routine task time by 30%. Full-stack background across React, Python and Java; postgraduate work in AI and cybersecurity at Durham College.',
      'location', 'Richmond Hill, Ontario, Canada',
      'email', 'akshaybharadva19@gmail.com',
      'available_for_work', true,
      'resume_url', ''
    ),
    jsonb_build_object(
      'github', 'https://github.com/akshay-bharadva',
      'linkedin', 'https://www.linkedin.com/in/akshay-bharadva',
      'upwork', 'https://www.upwork.com/freelancers/akshaybharadva'
    ),
    jsonb_build_object(
      'copyright', 'Akshay Bharadva',
      'note', 'Built with Next.js and Supabase. Source on GitHub.'
    ),
    'dynamic'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO navigation_links (user_id, label, href, display_order, is_visible)
  SELECT uid, v.label, v.href, v.ord, true
  FROM (VALUES
    ('Home',     '/',          0),
    ('About',    '/about',     1),
    ('Projects', '/projects',  2),
    ('Blog',     '/blog',      3),
    ('Updates',  '/updates',   4),
    ('Contact',  '/contact',   5)
  ) AS v(label, href, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM navigation_links n WHERE n.user_id = uid AND n.href = v.href
  );

  -- ==========================================================================
  -- 2. PORTFOLIO
  -- ==========================================================================

  -- Sections are looked up by title before inserting, so re-running keeps the
  -- items attached to the section they already belong to.
  SELECT id INTO sec_about FROM portfolio_sections
   WHERE user_id = uid AND title = 'About' AND page_path = '/about';
  IF sec_about IS NULL THEN
    INSERT INTO portfolio_sections (user_id, title, type, content, display_order, page_path, layout_style, is_visible)
    VALUES (uid, 'About', 'markdown',
E'I build AI systems that survive contact with real users.\n\nMost of my work is retrieval: getting a language model to answer from documents an organisation actually has, with citations, fast enough that someone reaches for it instead of asking a colleague. At Amico I own that pipeline end to end — ingestion, vector storage, retrieval tuning, prompt engineering, deployment.\n\nBefore AI I spent three years in full-stack and backend work: MERN at Digipie, Spring Boot microservices and PL/SQL at NJ Group. That background is why my AI work ships rather than demos.\n\nI moved from Surat to Ontario in 2023 for postgraduate study — AI, then cybersecurity — and stayed.',
      0, '/about', 'default', true)
    RETURNING id INTO sec_about;
  END IF;

  SELECT id INTO sec_exp FROM portfolio_sections
   WHERE user_id = uid AND title = 'Experience' AND page_path = '/';
  IF sec_exp IS NULL THEN
    INSERT INTO portfolio_sections (user_id, title, type, content, display_order, page_path, layout_style, is_visible)
    VALUES (uid, 'Experience', 'list_items', NULL, 1, '/', 'timeline', true)
    RETURNING id INTO sec_exp;
  END IF;

  SELECT id INTO sec_projects FROM portfolio_sections
   WHERE user_id = uid AND title = 'Projects' AND page_path = '/projects';
  IF sec_projects IS NULL THEN
    INSERT INTO portfolio_sections (user_id, title, type, content, display_order, page_path, layout_style, is_visible)
    VALUES (uid, 'Projects', 'list_items', NULL, 0, '/projects', 'cards', true)
    RETURNING id INTO sec_projects;
  END IF;

  SELECT id INTO sec_skills FROM portfolio_sections
   WHERE user_id = uid AND title = 'Skills' AND page_path = '/';
  IF sec_skills IS NULL THEN
    INSERT INTO portfolio_sections (user_id, title, type, content, display_order, page_path, layout_style, is_visible)
    VALUES (uid, 'Skills', 'list_items', NULL, 2, '/', 'tags', true)
    RETURNING id INTO sec_skills;
  END IF;

  SELECT id INTO sec_edu FROM portfolio_sections
   WHERE user_id = uid AND title = 'Education' AND page_path = '/about';
  IF sec_edu IS NULL THEN
    INSERT INTO portfolio_sections (user_id, title, type, content, display_order, page_path, layout_style, is_visible)
    VALUES (uid, 'Education', 'list_items', NULL, 1, '/about', 'timeline', true)
    RETURNING id INTO sec_edu;
  END IF;

  -- ── Experience ──────────────────────────────────────────────────────────
  INSERT INTO portfolio_items (section_id, user_id, title, subtitle, date_from, date_to, description, link_url, tags, display_order)
  SELECT sec_exp, uid, v.title, v.subtitle, v.dfrom, v.dto, v.descr, v.link, v.tags, v.ord
  FROM (VALUES
    ('AI Implementation Specialist', 'Amico Group of Companies', 'Jun 2025', 'Present',
E'Deployed "Hey Ami!" — a voice-activated RAG chatbot on LangChain and PGVector — cutting routine task time by 30% across sales and operations.\n\nBuilt the Complexity Matrix, an AI project-scoring tool that automated estimator prioritisation. Owned the whole pipeline: document ingestion, vector storage, retrieval tuning, prompt engineering and production deployment.',
     'https://www.amicogroup.com', ARRAY['LangChain','PGVector','RAG','Python','Production'], 0),

    ('AI Implementation Specialist', 'Amico Group of Companies · Contract', 'Sep 2024', 'May 2025',
     'Continued the RAG platform part-time alongside the cybersecurity postgraduate programme. Hardened retrieval quality and moved the assistant from pilot to daily use.',
     NULL, ARRAY['LangChain','Python','Hybrid'], 1),

    ('AI Implementation Specialist · Co-op', 'Amico Group of Companies', 'May 2024', 'Aug 2024',
     'Four-month co-op that became the RAG platform: first ingestion pipeline, first vector store, first internal users.',
     NULL, ARRAY['Python','Vector search'], 2),

    ('MERN Developer', 'Digipie Technologies', 'Dec 2022', 'Aug 2023',
E'Delivered a feature that generated a 20% revenue increase in Q1.\n\nModernised a legacy codebase to MERN standards, reducing running costs and improving deployment velocity. Worked the full SDLC across several concurrent client projects.',
     NULL, ARRAY['React','Node.js','MongoDB','Express'], 3),

    ('Full Stack Developer', 'NJ Group', 'May 2022', 'Nov 2022',
E'Architected microservices on Spring Boot, Docker and Kubernetes for scalable financial applications.\n\nBuilt SQL and PL/SQL components handling high-volume financial data — views, functions, triggers — and wrote the unit tests and proofs of concept that cut rework.',
     NULL, ARRAY['Java','Spring Boot','Kubernetes','PL/SQL'], 4),

    ('Full Stack Developer · Internship', 'NJ Group', 'Nov 2021', 'Apr 2022',
     'First professional role, during my BCA. Java backends, HTML5/CSS3/ES6 front ends, and the SQL and PL/SQL foundations — views, procedures, triggers — that everything since has rested on.',
     NULL, ARRAY['Java','JavaScript','SQL'], 5),

    ('Open-Source Developer', 'SigNoz · Volunteer', 'Apr 2023', 'Oct 2023',
     'Rewrote the pricing and product-comparison pages against Datadog, New Relic, Dynatrace and Grafana, and led the landing-page rebrand in Docusaurus, React and Tailwind for a leading open-source APM tool.',
     'https://github.com/SigNoz/signoz.io', ARRAY['React','TailwindCSS','Docusaurus','Open source'], 6)
  ) AS v(title, subtitle, dfrom, dto, descr, link, tags, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM portfolio_items p
     WHERE p.section_id = sec_exp AND p.title = v.title AND p.date_from = v.dfrom
  );

  -- ── Projects ────────────────────────────────────────────────────────────
  INSERT INTO portfolio_items (section_id, user_id, title, subtitle, date_from, description, link_url, tags, display_order)
  SELECT sec_projects, uid, v.title, v.subtitle, v.dfrom, v.descr, v.link, v.tags, v.ord
  FROM (VALUES
    ('Hey Ami!', 'Voice-activated enterprise RAG assistant', '2024',
E'A voice assistant over 300+ internal documents, answering with citations rather than confident guesses.\n\nLangChain for orchestration, PGVector for retrieval, a tuned chunking and reranking strategy for recall. Measured outcome: 30% less time on routine lookups for sales and engineering.',
     NULL, ARRAY['LangChain','PGVector','RAG','Python','Voice'], 0),

    ('FolioKit', 'Portfolio site and personal OS', '2025',
E'This site. A Next.js static export that doubles as a private workspace — tasks, habits, finance, learning, calendar, notes, whiteboards — behind Supabase auth with mandatory MFA.\n\nSeventeen modules, a design system of its own, and roughly 1,900 tests. Built as much to have somewhere to think as to have somewhere to publish.',
     'https://github.com/akshay-bharadva/foliokit', ARRAY['Next.js','TypeScript','Supabase','TailwindCSS'], 1),

    ('Spyglass', 'Python tooling', '2026',
     'A Python project I am building in the open. Early, and the commits are the honest record of it.',
     'https://github.com/akshay-bharadva/spyglass', ARRAY['Python'], 2),

    ('Complexity Matrix', 'AI project scoring for estimators', '2025',
     'An internal tool that scores incoming projects on complexity so estimators prioritise by difficulty rather than arrival order. The unglamorous kind of AI that saves a team real hours.',
     NULL, ARRAY['Python','Scoring','Internal tooling'], 3),

    ('Banking Chatbot', 'Durham College', 'Nov 2023',
     'An intent-matching banking assistant trained on question and answer sets, using NLTK, word tokenisation and fuzzy matching. The project that got me interested in retrieval as a problem in its own right.',
     NULL, ARRAY['Python','NLTK','NLP'], 4),

    ('Debug Layout', 'One-file layout debugging library', '2022',
     'A friend could not see why a layout was breaking, so I wrote a script tag that outlines every element on a checkbox toggle. Small, and still the thing people have thanked me for most.',
     'https://endless-debug-layout.netlify.app', ARRAY['JavaScript','CSS','Developer tools'], 5)
  ) AS v(title, subtitle, dfrom, descr, link, tags, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM portfolio_items p
     WHERE p.section_id = sec_projects AND p.title = v.title
  );

  -- ── Skills ──────────────────────────────────────────────────────────────
  INSERT INTO portfolio_items (section_id, user_id, title, subtitle, tags, display_order)
  SELECT sec_skills, uid, v.title, v.subtitle, v.tags, v.ord
  FROM (VALUES
    ('AI & Retrieval', 'What I do now',
     ARRAY['RAG','LangChain','PGVector','Prompt engineering','Vector search','LLM integration'], 0),
    ('Languages', NULL,
     ARRAY['Python','TypeScript','JavaScript','Java','SQL','PL/SQL'], 1),
    ('Frontend', NULL,
     ARRAY['React','Next.js','TailwindCSS','Redux Toolkit'], 2),
    ('Backend & Data', NULL,
     ARRAY['Node.js','Express','Spring Boot','PostgreSQL','MongoDB','Supabase'], 3),
    ('Platform', NULL,
     ARRAY['Docker','Kubernetes','CI/CD','Git'], 4),
    ('Data & ML', NULL,
     ARRAY['Pandas','NumPy','Scikit-Learn','Data analysis'], 5),
    ('Security', 'Postgraduate certificate',
     ARRAY['Application security','Threat modelling','Secure SDLC'], 6)
  ) AS v(title, subtitle, tags, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM portfolio_items p
     WHERE p.section_id = sec_skills AND p.title = v.title
  );

  -- ── Education ───────────────────────────────────────────────────────────
  INSERT INTO portfolio_items (section_id, user_id, title, subtitle, date_from, date_to, description, tags, display_order)
  SELECT sec_edu, uid, v.title, v.subtitle, v.dfrom, v.dto, v.descr, v.tags, v.ord
  FROM (VALUES
    ('Postgraduate Certificate, Cybersecurity', 'Durham College', 'Sep 2024', 'Apr 2025',
     'Taken alongside the Amico contract. Application security and secure development practice — the half of shipping AI that most courses leave out.',
     ARRAY['Cybersecurity'], 0),
    ('Postgraduate Certificate, AI Analysis, Design and Implementation', 'Durham College', 'Sep 2023', 'Aug 2024',
     'Graduated 4.78/5.00. Reinforcement learning, applied machine learning, and the projects that became my first retrieval work.',
     ARRAY['Artificial Intelligence','Machine Learning'], 1),
    ('Bachelor of Computer Application', 'Veer Narmad South Gujarat University', '2019', '2022',
     'BCA in Surat, with the NJ Group internship running alongside the final year.',
     ARRAY['Computer Science'], 2)
  ) AS v(title, subtitle, dfrom, dto, descr, tags, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM portfolio_items p
     WHERE p.section_id = sec_edu AND p.title = v.title
  );

  -- ==========================================================================
  -- 3. BLOG
  -- ==========================================================================

  INSERT INTO blog_posts (user_id, title, slug, excerpt, content, published, published_at, show_toc, tags, views)
  SELECT uid, v.title, v.slug, v.excerpt, v.content, v.published, v.pub_at, true, v.tags, v.views
  FROM (VALUES
    ('What I learned shipping a RAG system people actually use',
     'shipping-a-rag-system-people-use',
     'A demo answers your questions. A production system answers everyone else''s. The gap between them is most of the work.',
E'## The demo is not the product\n\nA retrieval demo takes an afternoon. You chunk some documents, embed them, and ask a question you already know the answer to. It works, and it tells you almost nothing.\n\nWhat it does not tell you is what happens when someone asks a question phrased in a way you did not anticipate, about a document that is a scanned PDF, in a hurry, on their phone.\n\n## Retrieval is the whole game\n\nMost of the quality in "Hey Ami!" came from retrieval, not from the model. Chunk boundaries that respect document structure. A reranking pass. Knowing when to say *I do not know* rather than assembling a fluent answer from three unrelated paragraphs.\n\nThat last one matters more than anything. A confident wrong answer costs more trust than ten refusals.\n\n## Citations change behaviour\n\nWe show the source for every answer. It was meant as a correctness feature; it turned out to be an adoption feature. People trust a system they can check, and once they trust it they use it for things you never designed for.\n\n## What I would do differently\n\nMeasure earlier. We knew the assistant felt faster long before we could say it cut routine lookups by 30%, and that number is what turned a project into a platform.',
     true, now() - interval '38 days', ARRAY['AI','RAG','Engineering'], 412),

    ('Why I built my own personal OS instead of using Notion',
     'why-i-built-my-own-personal-os',
     'Not because Notion is bad. Because the friction of shaping my life to someone else''s schema turned out to be the expensive part.',
E'## The honest reason\n\nI could have used Notion. Most people should.\n\nI built FolioKit because every tool I tried made me store the same fact twice — a task in one place, the calendar entry for it in another, the money it cost in a third — and then quietly let those copies drift apart.\n\n## One database, many views\n\nEverything here is one Postgres schema. A task with a due date appears on the calendar because it *is* on the calendar, not because it was synced there. Finance knows what a recurring payment is, so the forecast is derived rather than maintained.\n\n## What it cost\n\nSeventeen modules and about 1,900 tests. That is not a boast — it is the price of the previous paragraph. Derived state is only trustworthy if the derivation is tested, and I have learned that lesson expensively enough to write it down.\n\n## Would I recommend it\n\nOnly if you enjoy the building. The tool is genuinely better for me than what I replaced. It is better because it fits one person exactly, which is also why it would fit you badly.',
     true, now() - interval '17 days', ARRAY['Engineering','Personal','Next.js'], 289),

    ('Moving countries as a developer: the parts nobody mentions',
     'moving-countries-as-a-developer',
     'The visa and the job are the parts people prepare for. The rest of it is what actually takes the year.',
E'## The technical part is the easy part\n\nI moved from Surat to Ontario in 2023. The engineering transferred fine — a Spring Boot service is a Spring Boot service on either side of an ocean.\n\n## What did not transfer\n\nCredit history. Rental references. Knowing which bank is which, what a TFSA is, why everyone asks about your SIN. The small competences that make a person feel capable, all reset to zero at once.\n\n## On distance\n\nMy family is nine and a half hours ahead. That means the good hours to call are early morning or late evening, never the middle of the day when something has actually happened.\n\nI ended up building a timezone column into my own calendar for this. It is a small feature and I use it constantly.\n\n## What I would tell someone about to do it\n\nThe loneliness is a logistics problem more than an emotional one, and logistics problems have solutions. Find the hours that work. Protect them.',
     true, now() - interval '5 days', ARRAY['Career','Personal'], 156),

    ('Notes on retrieval evaluation',
     'notes-on-retrieval-evaluation',
     'Draft. How to tell whether a change to your chunking actually helped, without shipping it to find out.',
     '## Still writing this one.\n\nThe short version: build the eval set before you need it, from real questions people asked, and accept that fifty examples you trust beats five hundred you generated.',
     false, NULL, ARRAY['AI','RAG','Evaluation'], 0)
  ) AS v(title, slug, excerpt, content, published, pub_at, tags, views)
  WHERE NOT EXISTS (SELECT 1 FROM blog_posts b WHERE b.slug = v.slug);

  -- ── Public updates ──────────────────────────────────────────────────────
  INSERT INTO public_notes (user_id, title, content, category, tags, is_published, is_pinned, created_at)
  SELECT uid, v.title, v.content, v.cat, v.tags, true, v.pinned, v.created
  FROM (VALUES
    ('Shipped the calendar rebuild', 'Rewrote FolioKit''s calendar from scratch — recurrence, drag to reschedule, a second timezone gutter for calls home. Dropped five FullCalendar packages in the process.', 'milestone', ARRAY['FolioKit'], true, now() - interval '3 days'),
    ('1,900 tests', 'Crossed 1,900 tests on FolioKit. Roughly a third of them exist because something shipped broken first.', 'milestone', ARRAY['FolioKit','Testing'], false, now() - interval '9 days'),
    ('Reading: Designing Data-Intensive Applications', 'Second pass, three years after the first. The chapter on derived data reads completely differently now that I have built something that depends on it.', 'watching', ARRAY['Reading'], false, now() - interval '21 days'),
    ('GDG Cloud Toronto', 'Good session on vector databases at scale. Mostly reassuring — the problems are the ones I have, just larger.', 'activity', ARRAY['Community'], false, now() - interval '34 days')
  ) AS v(title, content, cat, tags, pinned, created)
  WHERE NOT EXISTS (SELECT 1 FROM public_notes n WHERE n.user_id = uid AND n.title = v.title);

  -- ==========================================================================
  -- 4. WORK — projects, tasks, subtasks
  -- ==========================================================================

  INSERT INTO task_projects (user_id, name, color, display_order)
  SELECT uid, v.name, v.color, v.ord
  FROM (VALUES
    ('FolioKit',      '#6366f1', 0),
    ('Spyglass',      '#10b981', 1),
    ('Career',        '#f59e0b', 2),
    ('Life admin',    '#64748b', 3)
  ) AS v(name, color, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM task_projects p WHERE p.user_id = uid AND p.name = v.name
  );

  SELECT id INTO proj_foliokit FROM task_projects WHERE user_id = uid AND name = 'FolioKit';
  SELECT id INTO proj_spyglass FROM task_projects WHERE user_id = uid AND name = 'Spyglass';
  SELECT id INTO proj_career   FROM task_projects WHERE user_id = uid AND name = 'Career';
  SELECT id INTO proj_life     FROM task_projects WHERE user_id = uid AND name = 'Life admin';

  INSERT INTO tasks (user_id, project_id, title, description, status, priority, due_date, tags, estimate_minutes, display_order, completed_at)
  SELECT uid, v.project, v.title, v.descr, v.status::task_status, v.prio::task_priority, v.due, v.tags, v.est, v.ord, v.done_at
  FROM (VALUES
    -- FolioKit
    (proj_foliokit, 'Run migration 012 on production', 'Discover places and topics. Nothing in that module works until it lands.', 'todo', 'high', today, ARRAY['database'], 15, 0, NULL::timestamptz),
    (proj_foliokit, 'Rebuild the dashboard around the day', 'Time spine rather than a grid of module cards.', 'done', 'high', today - 1, ARRAY['design'], 240, 1, now() - interval '1 day'),
    (proj_foliokit, 'Replace Remotive — its search parameter is ignored', 'Every query returned the same seventeen jobs. Moved to a board that actually filters.', 'done', 'medium', today - 1, ARRAY['bug'], 120, 2, now() - interval '20 hours'),
    (proj_foliokit, 'Write the deployment runbook', 'What to run, in what order, after a fresh clone.', 'todo', 'medium', today + 3, ARRAY['docs'], 90, 3, NULL),
    (proj_foliokit, 'Audit the public pages on mobile', 'The admin got all the attention this month.', 'todo', 'low', today + 6, ARRAY['design','mobile'], 120, 4, NULL),
    (proj_foliokit, 'Decide on lockdown migration 006', 'Opt-in. Read it properly before running it.', 'review', 'low', today + 10, ARRAY['database','security'], 30, 5, NULL),

    -- Spyglass
    (proj_spyglass, 'Sketch the CLI surface', 'What the first command should be, before writing any of it.', 'inprogress', 'medium', today + 2, ARRAY['design'], 60, 6, NULL),
    (proj_spyglass, 'Set up pytest and CI', 'Green from the first commit this time.', 'todo', 'medium', today + 4, ARRAY['testing'], 45, 7, NULL),
    (proj_spyglass, 'Write the README before the code', 'If it cannot be explained in a README it is not designed yet.', 'todo', 'low', today + 5, ARRAY['docs'], 30, 8, NULL),

    -- Career
    (proj_career, 'Refresh the resume with Amico numbers', 'The 30% figure and the Complexity Matrix are not on it yet.', 'inprogress', 'high', today + 1, ARRAY['job-search'], 90, 9, NULL),
    (proj_career, 'Write up the RAG evaluation post', 'Draft exists. Needs the eval-set section finishing.', 'todo', 'medium', today + 7, ARRAY['writing'], 180, 10, NULL),
    (proj_career, 'Reach out to two people from GDG Toronto', 'Follow up while the talk is still recent.', 'todo', 'medium', today + 2, ARRAY['networking'], 30, 11, NULL),
    (proj_career, 'Upwork profile: lead with the production system', 'Most freelancers selling AI have done a course.', 'done', 'medium', today - 4, ARRAY['freelance'], 45, 12, now() - interval '4 days'),

    -- Life admin
    (proj_life, 'Pay the credit card', 'Before the statement date, not after.', 'todo', 'high', today + 4, ARRAY['finance'], 10, 13, NULL),
    (proj_life, 'Book JOY''s annual vet visit', 'Overdue by a couple of weeks.', 'todo', 'medium', today - 3, ARRAY['cat'], 15, 14, NULL),
    (proj_life, 'Call home', 'Sunday morning is the hour that works both ends.', 'todo', 'high', today + 1, ARRAY['family'], 60, 15, NULL),
    (proj_life, 'Renew car insurance quote comparison', 'Before the next renewal. Worth an hour of shopping around.', 'todo', 'low', today + 20, ARRAY['finance'], 60, 16, NULL),
    (proj_life, 'Winter tires booked', 'Done for the season.', 'done', 'medium', today - 12, ARRAY['car'], 30, 17, now() - interval '12 days')
  ) AS v(project, title, descr, status, prio, due, tags, est, ord, done_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.user_id = uid AND t.title = v.title
  );

  SELECT id INTO t_id FROM tasks WHERE user_id = uid AND title = 'Refresh the resume with Amico numbers';
  IF t_id IS NOT NULL THEN
    INSERT INTO sub_tasks (task_id, user_id, title, is_completed)
    SELECT t_id, uid, v.title, v.done
    FROM (VALUES
      ('Add the Hey Ami! 30% figure', true),
      ('Add Complexity Matrix', false),
      ('Cut the 2021 internship detail to two lines', false),
      ('Export to PDF and check the second page', false)
    ) AS v(title, done)
    WHERE NOT EXISTS (
      SELECT 1 FROM sub_tasks s WHERE s.task_id = t_id AND s.title = v.title
    );
  END IF;

  -- ==========================================================================
  -- 5. HABITS
  -- ==========================================================================

  INSERT INTO habits (user_id, title, color, kind, schedule, schedule_days, target_per_week, time_of_day, notes, display_order, target_value, unit, step)
  SELECT uid, v.title, v.color, v.kind, v.sched, v.days, v.per_week, v.tod, v.notes, v.ord, v.target, v.unit, v.step
  FROM (VALUES
    ('Ship something',      '#6366f1', 'build', 'weekdays',     NULL::int[], NULL::int, 'anytime',   'A commit that moves a project, not a formatting pass.', 0, 1::numeric, NULL::text, 1::numeric),
    ('Read 20 pages',       '#10b981', 'build', 'daily',        NULL,        NULL,      'evening',   NULL, 1, 20, 'pages', 5),
    ('Walk',                '#f59e0b', 'build', 'daily',        NULL,        NULL,      'afternoon', 'Away from the desk, not to the kitchen.', 2, 30, 'minutes', 10),
    ('Call family',         '#ec4899', 'build', 'weekly_count', NULL,        2,         'morning',   'Nine and a half hours ahead — mornings here are evenings there.', 3, 1, NULL, 1),
    ('Gym',                 '#8b5cf6', 'build', 'custom',       ARRAY[1,3,5], NULL,     'morning',   NULL, 4, 1, NULL, 1),
    ('No doomscrolling',    '#ef4444', 'quit',  'daily',        NULL,        NULL,      'anytime',   'The evening hour that used to be reading.', 5, 1, NULL, 1),
    ('Log the day''s spend','#14b8a6', 'build', 'daily',        NULL,        NULL,      'evening',   'Two minutes, or it becomes a two-hour job on Sunday.', 6, 1, NULL, 1)
  ) AS v(title, color, kind, sched, days, per_week, tod, notes, ord, target, unit, step)
  WHERE NOT EXISTS (
    SELECT 1 FROM habits h WHERE h.user_id = uid AND h.title = v.title
  );

  -- A plausible six weeks of history, so the heatmap and streaks have shape.
  -- Deterministic rather than random: a seed that produces a different picture
  -- on every run is impossible to reason about when something looks wrong.
  INSERT INTO habit_logs (habit_id, completed_date, value)
  SELECT h.id, d::date, 1
  FROM habits h
  CROSS JOIN generate_series(today - 41, today - 1, interval '1 day') AS d
  WHERE h.user_id = uid
    AND (
      -- Roughly 80% adherence, thinning slightly on weekends, and varying by
      -- habit so no two rows are identical.
      (extract(doy FROM d)::int + h.display_order * 7) % 5 <> 0
    )
    AND (h.schedule <> 'weekdays' OR extract(isodow FROM d) < 6)
    AND (h.schedule <> 'custom'   OR extract(isodow FROM d)::int = ANY (h.schedule_days))
    AND (h.schedule <> 'weekly_count' OR extract(isodow FROM d) IN (6, 7))
    AND NOT EXISTS (
      SELECT 1 FROM habit_logs l WHERE l.habit_id = h.id AND l.completed_date = d::date
    );

  -- ==========================================================================
  -- 6. LEARNING
  -- ==========================================================================

  INSERT INTO learning_subjects (user_id, name, description, color, target_minutes_per_week, display_order)
  SELECT uid, v.name, v.descr, v.color, v.target, v.ord
  FROM (VALUES
    ('Applied AI', 'Retrieval, evaluation, and the parts of LLM work that decide whether a system is trusted.', '#6366f1', 240, 0),
    ('Security', 'Carrying the Durham certificate into practice rather than leaving it on the resume.', '#ef4444', 120, 1),
    ('Systems', 'The Postgres and distributed-systems reading that makes the rest of it hold together.', '#10b981', 120, 2)
  ) AS v(name, descr, color, target, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM learning_subjects s WHERE s.user_id = uid AND s.name = v.name
  );

  SELECT id INTO subj_ai  FROM learning_subjects WHERE user_id = uid AND name = 'Applied AI';
  SELECT id INTO subj_sec FROM learning_subjects WHERE user_id = uid AND name = 'Security';
  SELECT id INTO subj_sys FROM learning_subjects WHERE user_id = uid AND name = 'Systems';

  INSERT INTO learning_topics (user_id, subject_id, title, status, core_notes, confidence_score, ease, interval_days, due_date, last_reviewed_at, review_count, display_order)
  SELECT uid, v.subject, v.title, v.status::learning_status, v.notes, v.conf, v.ease, v.interval, v.due, v.reviewed, v.count, v.ord
  FROM (VALUES
    (subj_ai, 'Chunking strategies', 'Practicing', 'Structure-aware beats fixed-size almost always. Overlap buys recall at the cost of index size — 10-15% is the range worth testing.', 4, 2.6::numeric, 12, today + 2, now() - interval '10 days', 5, 0),
    (subj_ai, 'Reranking', 'Practicing', 'Cross-encoder after bi-encoder retrieval. Expensive per query, but it is the single biggest quality jump available for the money.', 4, 2.5, 8, today, now() - interval '8 days', 4, 1),
    (subj_ai, 'Retrieval evaluation', 'Learning', 'Recall@k and MRR are the starting point. The hard part is building an eval set from questions real users asked, not ones you invented.', 2, 2.3, 3, today - 1, now() - interval '4 days', 2, 2),
    (subj_ai, 'Agentic patterns', 'To Learn', 'Tool use, planning loops, and knowing when a plain retrieval call is the better answer.', NULL, 2.5, 0, NULL, NULL, 0, 3),
    (subj_ai, 'Prompt caching economics', 'Learning', 'Cache the stable prefix, vary the tail. Changes the cost model more than the latency.', 3, 2.5, 5, today + 4, now() - interval '1 day', 3, 4),

    (subj_sec, 'Threat modelling', 'Practicing', 'STRIDE per data flow. The value is the conversation it forces, not the diagram it produces.', 4, 2.6, 15, today + 6, now() - interval '9 days', 6, 5),
    (subj_sec, 'Row Level Security', 'Mastered', 'Policy per table, and never trust a client guard. SECURITY DEFINER bypasses RLS entirely — whatever the policy required, the function must require itself.', 5, 2.8, 30, today + 21, now() - interval '9 days', 8, 6),
    (subj_sec, 'Prompt injection', 'Learning', 'The retrieval corpus is untrusted input. Anything a document can say, an attacker can put in a document.', 2, 2.2, 4, today + 1, now() - interval '3 days', 2, 7),

    (subj_sys, 'Postgres query planning', 'Learning', 'EXPLAIN ANALYZE before optimising. The plan is usually not the one you assumed.', 3, 2.4, 6, today + 3, now() - interval '3 days', 3, 8),
    (subj_sys, 'Derived vs stored state', 'Practicing', 'Store what cannot be derived. Every cached copy is a future disagreement — the single most expensive lesson from building FolioKit.', 4, 2.7, 20, today + 12, now() - interval '8 days', 5, 9),
    (subj_sys, 'Vector index tuning', 'To Learn', 'HNSW parameters, and what recall actually costs at each setting.', NULL, 2.5, 0, NULL, NULL, 0, 10)
  ) AS v(subject, title, status, notes, conf, ease, interval, due, reviewed, count, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM learning_topics t WHERE t.user_id = uid AND t.title = v.title
  );

  -- ==========================================================================
  -- 7. NOTES
  -- ==========================================================================

  INSERT INTO notes (user_id, title, content, color, tags, is_pinned, created_at)
  SELECT uid, v.title, v.content, v.color, v.tags, v.pinned, v.created
  FROM (VALUES
    ('Hey Ami! — what actually moved the needle',
E'Ranked by impact, not by effort:\n\n1. Reranking after retrieval. Biggest single jump.\n2. Structure-aware chunking. Second biggest, and cheaper.\n3. Citations. Barely changed accuracy, transformed adoption.\n4. Refusing to answer when confidence is low. Costs a few percent of coverage, buys all of the trust.\n\nThe model swap we spent two weeks on came fifth.',
     '#6366f1', ARRAY['AI','RAG','Work'], true, now() - interval '30 days'),

    ('Interview answers I keep needing',
E'**The 30% figure** — routine lookup time across sales and ops, measured before and after, over four weeks.\n\n**Why RAG and not fine-tuning** — the corpus changes weekly. Fine-tuning bakes in a snapshot; retrieval reads the current one.\n\n**Hardest problem** — not the model. Getting scanned PDFs into a form worth embedding.\n\n**Something that failed** — first version answered everything confidently, including things it had no source for. Had to build the refusal path before anyone would trust it.',
     '#f59e0b', ARRAY['Career','Interview'], true, now() - interval '11 days'),

    ('Bugs that taught me something',
E'- A day is not 86,400,000ms. Twice a year it is 23 or 25 hours, and every fixed-millisecond date walk breaks in the last week of March and October.\n- `toISOString().slice(0,10)` is the *UTC* day. After 8pm here it is already tomorrow.\n- An endpoint with no call site is not dead code. It is a feature that appears to exist.\n- A test written after the fix has no evidence it works. Reintroduce the bug and watch it fail.',
     '#ef4444', ARRAY['Engineering','Lessons'], true, now() - interval '6 days'),

    ('Spyglass — first principles',
E'Before writing any more of it:\n\n- What is the single command someone runs first?\n- What does it print when it has nothing to say?\n- What breaks if the input is enormous?\n\nIf the README cannot answer those three, the design is not finished.',
     '#10b981', ARRAY['Spyglass','Design'], false, now() - interval '4 days'),

    ('Sending money home — the arithmetic',
E'The corridor rate moves 1-2% in a month, which on a meaningful transfer is real money.\n\nRule I have settled on: check the 30-day average, send when the rate is above it, never send in a hurry on a Friday afternoon. The fee matters less than the rate — most of the difference is in the spread, not the stated charge.',
     '#14b8a6', ARRAY['Finance','Family'], false, now() - interval '15 days'),

    ('Reading queue',
E'- Designing Data-Intensive Applications — second pass, chapter 11 onward\n- The Staff Engineer''s Path\n- Anything solid on retrieval evaluation; the field is mostly blog posts so far',
     '#8b5cf6', ARRAY['Reading'], false, now() - interval '22 days')
  ) AS v(title, content, color, tags, pinned, created)
  WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.user_id = uid AND n.title = v.title);

  -- ==========================================================================
  -- 8. FINANCE
  -- ==========================================================================

  INSERT INTO finance_settings (user_id, base_currency, home_currency, needs_target_pct, wants_target_pct, save_target_pct, runway_target_months)
  VALUES (uid, 'CAD', 'INR', 50, 30, 20, 6)
  ON CONFLICT (user_id) DO NOTHING;

  -- Structure only. The real opening balances live in seed.finance.local.sql,
  -- which is gitignored — this repository is public, and a committed balance
  -- is a published one.
  INSERT INTO finance_accounts (user_id, name, kind, currency, institution, opening_balance, opening_date, is_liquid, sort_order, credit_limit, statement_day, payment_due_day)
  SELECT uid, v.name, v.kind::account_kind, 'CAD', v.inst, 0, today - 30, v.liquid, v.ord, v.limit_amt, v.stmt, v.due
  FROM (VALUES
    ('RBC Chequing',  'chequing',   'RBC',  true,  0, NULL::numeric, NULL::int, NULL::int),
    ('RBC Savings',   'savings',    'RBC',  true,  1, NULL, NULL, NULL),
    ('RBC TFSA',      'investment', 'RBC',  false, 2, NULL, NULL, NULL),
    ('RBC RRSP',      'investment', 'RBC',  false, 3, NULL, NULL, NULL),
    ('CIBC Chequing', 'chequing',   'CIBC', true,  4, NULL, NULL, NULL),
    ('CIBC Savings',  'savings',    'CIBC', true,  5, NULL, NULL, NULL),
    ('Credit Card',   'credit',     'CIBC', false, 6, NULL, 18, 8)
  ) AS v(name, kind, inst, liquid, ord, limit_amt, stmt, due)
  WHERE NOT EXISTS (
    SELECT 1 FROM finance_accounts a WHERE a.user_id = uid AND a.name = v.name
  );

  SELECT id INTO acc_rbc_cheq  FROM finance_accounts WHERE user_id = uid AND name = 'RBC Chequing';
  SELECT id INTO acc_rbc_save  FROM finance_accounts WHERE user_id = uid AND name = 'RBC Savings';
  SELECT id INTO acc_rbc_tfsa  FROM finance_accounts WHERE user_id = uid AND name = 'RBC TFSA';
  SELECT id INTO acc_rbc_rrsp  FROM finance_accounts WHERE user_id = uid AND name = 'RBC RRSP';
  SELECT id INTO acc_cibc_cheq FROM finance_accounts WHERE user_id = uid AND name = 'CIBC Chequing';
  SELECT id INTO acc_cibc_save FROM finance_accounts WHERE user_id = uid AND name = 'CIBC Savings';
  SELECT id INTO acc_credit    FROM finance_accounts WHERE user_id = uid AND name = 'Credit Card';

  INSERT INTO finance_categories (user_id, name, bucket, icon, is_essential, sort_order)
  SELECT uid, v.name, v.bucket::category_bucket, v.icon, v.essential, v.ord
  FROM (VALUES
    ('Salary',          'income',   '💼', true,  0),
    ('Freelance',       'income',   '🧑‍💻', false, 1),
    ('Rent',            'need',     '🏠', true,  2),
    ('Car insurance',   'need',     '🚗', true,  3),
    ('Groceries',       'need',     '🛒', true,  4),
    ('Utilities',       'need',     '💡', true,  5),
    ('Phone & internet','need',     '📱', true,  6),
    ('JOY',             'need',     '🐈', true,  7),
    ('Dining out',      'want',     '🍜', false, 8),
    ('Subscriptions',   'want',     '📺', false, 9),
    ('Shopping',        'want',     '🛍️', false, 10),
    ('Family support',  'need',     '🏡', true,  11),
    ('Savings',         'save',     '🪙', false, 12),
    ('Transfer',        'transfer', '🔁', false, 13)
  ) AS v(name, bucket, icon, essential, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM finance_categories c WHERE c.user_id = uid AND c.name = v.name
  );

  SELECT id INTO cat_salary    FROM finance_categories WHERE user_id = uid AND name = 'Salary';
  SELECT id INTO cat_rent      FROM finance_categories WHERE user_id = uid AND name = 'Rent';
  SELECT id INTO cat_transport FROM finance_categories WHERE user_id = uid AND name = 'Car insurance';
  SELECT id INTO cat_pet       FROM finance_categories WHERE user_id = uid AND name = 'JOY';
  SELECT id INTO cat_grocery   FROM finance_categories WHERE user_id = uid AND name = 'Groceries';
  SELECT id INTO cat_dining    FROM finance_categories WHERE user_id = uid AND name = 'Dining out';
  SELECT id INTO cat_subs      FROM finance_categories WHERE user_id = uid AND name = 'Subscriptions';
  SELECT id INTO cat_savings   FROM finance_categories WHERE user_id = uid AND name = 'Savings';
  SELECT id INTO cat_transfer  FROM finance_categories WHERE user_id = uid AND name = 'Transfer';

  -- Recurring items, the ledger, budgets and goals carry real figures, so they
  -- live in db/seed.finance.local.sql. Run that after this one.

  -- ==========================================================================
  -- 9. CALENDAR
  -- ==========================================================================

  INSERT INTO calendar_settings (user_id, home_timezone, day_start_hour, day_end_hour, week_starts_on, default_view, show_tasks, show_habits, show_finance)
  VALUES (uid, 'Asia/Kolkata', 7, 22, 1, 'week', true, true, true)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO calendars (user_id, name, color_token, is_visible, is_default, sort_order)
  SELECT uid, v.name, v.token, true, v.def, v.ord
  FROM (VALUES
    ('Work',     'chart-1', true,  0),
    ('Personal', 'chart-2', false, 1),
    ('Learning', 'chart-4', false, 2)
  ) AS v(name, token, def, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM calendars c WHERE c.user_id = uid AND c.name = v.name
  );

  SELECT id INTO cal_work     FROM calendars WHERE user_id = uid AND name = 'Work';
  SELECT id INTO cal_personal FROM calendars WHERE user_id = uid AND name = 'Personal';
  SELECT id INTO cal_learning FROM calendars WHERE user_id = uid AND name = 'Learning';

  INSERT INTO events (user_id, title, description, start_time, end_time, is_all_day, calendar_id, rrule, location)
  SELECT uid, v.title, v.descr, v.starts, v.ends, false, v.cal, v.rule, v.loc
  FROM (VALUES
    ('Standup', 'Fifteen minutes, and it should stay fifteen.',
     today + time '09:30', today + time '09:45', cal_work, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Teams'),
    ('RAG platform sync', 'Retrieval quality review with sales and ops.',
     today + time '14:00', today + time '15:00', cal_work, 'FREQ=WEEKLY;BYDAY=TU', 'Richmond Hill'),
    ('Deep work — Spyglass', 'Protected. No meetings in this block.',
     today + time '16:00', today + time '18:00', cal_work, 'FREQ=WEEKLY;BYDAY=MO,WE', NULL),
    ('Call home', 'Morning here, evening there.',
     today + time '08:00', today + time '09:00', cal_personal, 'FREQ=WEEKLY;BYDAY=SU', NULL),
    ('Gym', NULL,
     today + time '07:00', today + time '08:00', cal_personal, 'FREQ=WEEKLY;BYDAY=MO,WE,FR', NULL),
    ('Review session', 'Spaced repetition — whatever is due.',
     today + time '20:00', today + time '20:30', cal_learning, 'FREQ=DAILY', NULL),
    ('Vet — JOY', 'Annual check, overdue.',
     today + 2 + time '11:00', today + 2 + time '11:45', cal_personal, NULL, 'Richmond Hill'),
    ('GDG Cloud Toronto', 'Monthly meetup.',
     today + 9 + time '18:30', today + 9 + time '21:00', cal_personal, NULL, 'Toronto')
  ) AS v(title, descr, starts, ends, cal, rule, loc)
  WHERE NOT EXISTS (
    SELECT 1 FROM events e WHERE e.user_id = uid AND e.title = v.title
  );

  -- ==========================================================================
  -- 10. INVENTORY, DISCOVER, WHITEBOARD
  -- ==========================================================================

  INSERT INTO inventory_items (user_id, name, category, purchase_date, warranty_expiry, purchase_price, current_value, location, quantity, tags, notes)
  SELECT uid, v.name, v.cat, v.bought, v.warranty, v.price, v.value, v.loc, 1, v.tags, v.notes
  FROM (VALUES
    ('MacBook Pro 14"', 'Electronics', today - 500, today - 500 + 1095, 2800::numeric, 1900::numeric, 'Desk', ARRAY['work','primary'], 'Main development machine.'),
    ('Dell 27" monitor', 'Electronics', today - 420, today - 420 + 1095, 420, 260, 'Desk', ARRAY['work'], NULL),
    ('Mechanical keyboard', 'Electronics', today - 300, NULL, 160, 110, 'Desk', ARRAY['work'], NULL),
    ('Winter tires', 'Automotive', today - 6, NULL, 480, 480, 'Storage', ARRAY['car','seasonal'], 'Four, with rims.'),
    ('Cat tree', 'Home', today - 200, NULL, 130, 70, 'Living room', ARRAY['JOY'], 'JOY uses exactly one level of it.')
  ) AS v(name, cat, bought, warranty, price, value, loc, tags, notes)
  WHERE NOT EXISTS (
    SELECT 1 FROM inventory_items i WHERE i.user_id = uid AND i.name = v.name
  );

  -- Discover: where you are, and where the people you left behind are.
  INSERT INTO discover_places (user_id, label, latitude, longitude, timezone, sort_order)
  SELECT uid, v.label, v.lat, v.lon, v.tz, v.ord
  FROM (VALUES
    ('Richmond Hill', 43.8828::numeric, -79.4403::numeric, 'America/Toronto', 0),
    ('Surat',         21.1702,          72.8311,           'Asia/Kolkata',    1)
  ) AS v(label, lat, lon, tz, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM discover_places p WHERE p.user_id = uid AND p.label = v.label
  );

  INSERT INTO discover_topics (user_id, term, source, sort_order)
  SELECT uid, v.term, v.src, v.ord
  FROM (VALUES
    ('rag',        'hackernews', 0),
    ('postgres',   'hackernews', 1),
    ('typescript', 'devto',      2),
    ('llm',        'hackernews', 3)
  ) AS v(term, src, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM discover_topics t
     WHERE t.user_id = uid AND t.term = v.term AND t.source = v.src
  );

  RAISE NOTICE 'Seed complete for user %.', uid;
END $$;
