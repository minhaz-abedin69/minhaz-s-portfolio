/* ==========================================================================
   data.js — every piece of content on the site lives here.
   Edit this file; the pages (index, projects, people, library, contact)
   render from it. No HTML changes needed for normal updates.

   Optional fields can be left as "" or [] — the UI simply skips them, so
   there are never empty boxes or dead links.

   ADD A PROJECT      → add an object to `projects`
   ADD A PERSON       → add an object to `people`     (page is empty until you do)
   ADD A LIBRARY ITEM → add an object to `library`
   ========================================================================== */

window.SITE = {
  /* ---------------------------------------------------------------- Profile */
  profile: {
    name: "Minhaz Abedin",
    headline: "CSE Student and Aspiring Software Engineer",

    // Shown as the availability chip under the headline. Set open:false to hide the green dot.
    status: { open: true, label: "Open to questions and opportunities" },

    // Optional. Your main website address, e.g. "https://example.com". When set, the Website page
    // opens with a "Visit my website" card. Leave "" until you have one.
    website: "",

    // Optional. Leave "" to hide. timezone must be an IANA name, e.g. "Asia/Dhaka".
    location: "",
    timezone: "",

    // Optional. Put a PDF in /assets and set e.g. "assets/Minhaz-Abedin-CV.pdf" to show CV buttons.
    cv: "",

    avatar: "assets/images/avatar-480.webp",
    avatarAlt: "Portrait of Minhaz Abedin",

    // Used for the live follower count and project star counts (public GitHub API, cached per session).
    githubUser: "minhaz-abedin69",

    // First paragraph is always visible; the rest sit behind "Read more".
    about: [
      "I'm Minhaz Abedin, a Computer Science & Engineering student at International Islamic University Chittagong (IIUC). Most of my time goes into two things that feed each other: writing clean C++ and working through data structures and algorithms problems.",
      "Right now I'm learning software engineering fundamentals, object-oriented design, and web development, alongside a steady diet of competitive programming to keep my problem-solving sharp.",
      "I'm headed toward a career as a software engineer: someone who can design systems thoughtfully and reason clearly about the algorithms running underneath them.",
    ],

    focus: ["C++", "Data Structures", "Algorithms", "OOP", "Web Development"],
  },

  /* ------------------------------------------------------------- Navigation */
  nav: {
    primary: [
      { id: "home", label: "Profile", href: "index.html", icon: "userc" },
      { id: "projects", label: "Projects", href: "projects.html", icon: "cube" },
      { id: "website", label: "Website", href: "website.html", icon: "globe" },
      { id: "contact", label: "Contact", href: "contact.html", icon: "mail" },
    ],
    secondary: [{ id: "library", label: "Library", href: "library.html", icon: "library" }],
    // Bottom tab bar on phones (Contact lives in the top bar there).
    tabs: ["home", "projects", "people", "library"],
  },

  /* -------------------------------------------------------------- Education */
  education: [
    {
      mark: "IIUC",
      role: "CSE Student",
      school: "International Islamic University Chittagong",
      degree: "Department of Computer Science & Engineering (CSE)",
      note:
        "Studying the foundations of computing (data structures, algorithms, and software engineering) while applying them through personal projects alongside coursework.",
      period: "", // e.g. "2023 to present" — left blank until you add it
    },
  ],

  /* ----------------------------------------------------------------- Skills
     level: "Comfortable" | "Practicing" | "Learning"
     A new `category` automatically creates a new group.                     */
  skills: [
    { name: "C", category: "Programming", level: "Comfortable" },
    { name: "C++", category: "Programming", level: "Comfortable" },
    { name: "Java", category: "Programming", level: "Learning" },

    { name: "Data Structures", category: "Core Computer Science", level: "Practicing" },
    { name: "Algorithms", category: "Core Computer Science", level: "Practicing" },
    { name: "OOP", category: "Core Computer Science", level: "Comfortable" },
    { name: "Problem Solving", category: "Core Computer Science", level: "Practicing" },

    { name: "HTML", category: "Web", level: "Comfortable" },
    { name: "CSS", category: "Web", level: "Practicing" },
    { name: "JavaScript", category: "Web", level: "Learning" },

    { name: "Git", category: "Tools", level: "Practicing" },
    { name: "GitHub", category: "Tools", level: "Practicing" },
    { name: "VS Code", category: "Tools", level: "Comfortable" },

    { name: "CapCut", category: "Creative Tools", level: "Practicing" },
  ],

  /* ---------------------------------------------- Problem solving & journey
     level: "Comfortable" | "Practicing" | "Exploring"                        */
  journey: {
    lead:
      "Where I stand right now: what I'm comfortable with, and what I'm still building.",
    items: [
      { title: "C / C++", level: "Comfortable", text: "Daily driver for coursework and competitive programming." },
      { title: "Data Structures", level: "Practicing", text: "Arrays, linked lists, trees, and graphs, building intuition through practice." },
      { title: "Algorithms", level: "Practicing", text: "Working through sorting, searching, and graph algorithms problem by problem." },
      { title: "Codeforces", level: "Exploring", text: "Solving regularly to build speed and pattern recognition under time pressure." },
      { title: "LeetCode", level: "Exploring", text: "Working through topic-wise problem sets to reinforce fundamentals." },
    ],
  },

  /* --------------------------------------------------------------- Projects
     {
       title, slug, description, technologies: [],
       categories: [],            // used by the filter chips on projects.html
       image: "",                 // optional screenshot path; falls back to the glyph tile
       glyph: "{ }",              // shown on the tile when there is no image
       github: "", live: "",      // leave "" to hide that button
       links: [{label,url}],      // extra links (used instead of github/live when present)
       status: "",                // e.g. "Completed", "Ongoing", "In progress" — "" hides it
       featured: false            // featured projects get the larger card + appear on the profile
     }                                                                         */
  projects: [
    {
      title: "University Management System",
      slug: "university-management-system",
      description:
        "A C++ & OOP-based system for managing university records (students, courses, and enrollment), built around file handling and the STL rather than a database.",
      technologies: ["C++", "OOP", "STL", "File Handling"],
      categories: ["C and C++"],
      glyph: "{ }",
      github: "https://github.com/minhaz-abedin69",
      live: "https://claude.ai/artifact/CRRK3BxPey8gBfyUz2rKCp",
      status: "",
      featured: true,
    },
    {
      title: "Boolean Algebra & Logic Gates: Study Dashboard",
      slug: "boolean-algebra-study-dashboard",
      description:
        "An interactive dashboard covering Chapter 2 (Boolean Algebra & Logic Gates) of a Digital Logic Design course: every textbook problem with worked answers, a Boolean-expression simplification tool, quizzes, and progress tracking, all in plain HTML/CSS/JS.",
      technologies: ["HTML", "CSS", "JavaScript"],
      categories: ["Web"],
      glyph: "01",
      github: "https://github.com/minhaz-abedin69/Boolean-algebra-chapter-2",
      live: "https://minhaz-abedin69.github.io/Boolean-algebra-chapter-2/",
      status: "",
      featured: true,
    },
    {
      title: "E-Voting Simulation",
      slug: "e-voting-simulation",
      description:
        "A first-year project simulating an election system: a C program handling the voting/counting logic, paired with an interactive HTML/CSS/JavaScript front end with sound effects for actions like casting a vote.",
      technologies: ["C", "HTML", "CSS", "JavaScript"],
      categories: ["C and C++", "Web"],
      glyph: "✓",
      github: "https://github.com/minhaz-abedin69/E-voting-project-1st-year-final-",
      live: "",
      status: "Completed",
      featured: false,
    },
    {
      title: "Login Page UI",
      slug: "login-page-ui",
      description:
        "A responsive login page built to practice form design and front-end interactivity: clean layout, styled inputs, and JavaScript-driven interactions.",
      technologies: ["HTML", "CSS", "JavaScript"],
      categories: ["Web"],
      glyph: "⇥",
      github: "https://github.com/minhaz-abedin69/Web-login-page1.",
      live: "https://minhaz-abedin69.github.io/Web-login-page1./",
      status: "",
      featured: false,
    },
    {
      title: "Competitive Programming",
      slug: "competitive-programming",
      description:
        "An ongoing habit rather than a single build: working through problems on Codeforces and LeetCode to get faster and more precise with data structures and algorithms.",
      technologies: [],
      categories: ["Problem solving"],
      glyph: "∑",
      github: "",
      live: "",
      links: [
        { label: "Codeforces profile", url: "https://codeforces.com/profile/Minhaz_Abedin" },
        { label: "LeetCode profile", url: "https://leetcode.com/u/Minhaz%20Abedin/" },
      ],
      status: "Ongoing",
      featured: false,
    },
  ],

  /* ----------------------------------------------------------------- People
     Empty on purpose: add the people you actually learn from.
     {
       name: "Full Name",
       slug: "full-name",                  // used for people.html#full-name
       role: "What they do",
       why: "Why I follow them",           // optional
       image: "assets/images/people/x.webp", // optional; initials are shown otherwise
       tags: ["C++", "Teaching"],
       links: [
         { platform: "GitHub",   url: "https://github.com/handle",  handle: "@handle" },
         { platform: "X",        url: "https://x.com/handle",       handle: "@handle" },
         { platform: "YouTube",  url: "https://youtube.com/@handle", handle: "@handle" },
         { platform: "Website",  url: "https://example.com",         handle: "example.com" }
       ],
       favorite: false
     }                                                                         */
  people: [],

  /* ---------------------------------------------------------------- Library
     {
       title, url, type, source, description, tags: [], note: "optional personal note"
     }
     type is one of the ids in `libraryTypes` below.                           */
  libraryTypes: [
    { id: "article", label: "Articles" },
    { id: "note", label: "Notes" },
    { id: "resource", label: "Resources" },
    { id: "bookmark", label: "Bookmarks" },
    { id: "learning", label: "Learning" },
    { id: "reference", label: "References" },
  ],
  library: [
    {
      title: "Codeforces",
      url: "https://codeforces.com/",
      type: "resource",
      source: "codeforces.com",
      description: "Contest problems that build speed and pattern recognition under time pressure.",
      tags: ["Competitive programming"],
    },
    {
      title: "LeetCode",
      url: "https://leetcode.com/",
      type: "resource",
      source: "leetcode.com",
      description: "Topic-wise problem sets for reinforcing data structures and algorithms fundamentals.",
      tags: ["Data structures", "Algorithms"],
    },
  ],

  /* ---------------------------------------------------------------- Contact */
  contact: {
    email: "minhazabedin8068@gmail.com",
    // Web3Forms public access key (safe to expose; it only allows sending to your inbox).
    web3formsKey: "c2b086fd-a926-4b09-99f7-0894827f4e4d",
    intro:
      "Have a question, an opportunity, or just want to talk about algorithms? I'd like to hear from you.",
    topics: [
      { id: "question", title: "A question", cta: "Ask a question", text: "About a project, my code, or something I wrote.", subject: "Question" },
      { id: "opportunity", title: "An opportunity", cta: "Share an opportunity", text: "A role, collaboration, or anything you think fits.", subject: "Opportunity" },
      { id: "algorithms", title: "Algorithms", cta: "Talk algorithms", text: "Data structures, contest problems, or a tricky solution.", subject: "Algorithms" },
      { id: "hello", title: "Just hello", cta: "Say hi", text: "No agenda is a fine agenda.", subject: "Hello" },
    ],
  },

  /* ----------------------------------------- Experience and achievements
     Empty on purpose. Anything you add here is used by the Work page AND by the
     AI assistant, which will otherwise say these are "not listed".
     experience:   [{ role, org, period, note }]
     achievements: [{ title, note, year }]                                    */
  experience: [],
  achievements: [],

  /* -------------------------------------------------------- AI assistant
     The assistant answers ONLY from this file (see js/assistant-knowledge.js).
     endpoint: leave "" to use the built-in local answers (no server, no keys).
     To use a real AI model, deploy api/chat.js (see README) and set it to
     "/api/chat". API keys live on the server as environment variables, never here. */
  assistant: {
    enabled: true,
    endpoint: "",
    autoStart: { scrollPercent: 30, afterSeconds: 30, minSeconds: 6, bubbleDelayMs: 2600 },
  },

  /* ----------------------------------------------- GitHub section (Work tab)
     contributionsApi: public endpoint that returns the contribution calendar
     (GitHub only exposes it through an authenticated API). Set "" to hide the graph. */
  github: {
    contributionsApi: "https://github-contributions-api.jogruber.de/v4/",
  },

  /* ---------------------------------------------------------------- Socials */
  socials: [
    { platform: "GitHub", icon: "github", handle: "@minhaz-abedin69", url: "https://github.com/minhaz-abedin69" },
    { platform: "LinkedIn", icon: "linkedin", handle: "in/minhaz-abedin", url: "https://www.linkedin.com/in/minhaz-abedin-a8294639b" },
    { platform: "Instagram", icon: "instagram", handle: "@_minhaz_abedin_", url: "https://www.instagram.com/_minhaz_abedin_" },
    { platform: "Codeforces", icon: "codeforces", handle: "Minhaz_Abedin", url: "https://codeforces.com/profile/Minhaz_Abedin" },
    { platform: "LeetCode", icon: "leetcode", handle: "Minhaz Abedin", url: "https://leetcode.com/u/Minhaz%20Abedin/" },
  ],
};
