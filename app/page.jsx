
import Image from "next/image"
import AntPic from "./components/ants.png"
import MapPic from "./components/map.png"
import JerryPic from "./components/jerrymapping.png"
import PhilPic from "./components/phil.png"

export default function Home() {
  return (
    <main>
      <div className="page-root">

        {/* ── Section 1: Intro ── */}
        <section id="intro" className="intro-section">
          <p className="hero-eyebrow">Software Engineer &nbsp;·&nbsp; New York City</p>
          <p className="hero-name">Mikail Krochta</p>
          <p className="hero-desc">
            I build backend systems that handle complex rules at scale, with a background in data pipelines and applied machine learning.
          </p>
          <span className="scroll-hint">↓ scroll</span>
        </section>

        <hr className="page-divider" />

        {/* ── Section 2: About ── */}
        <section id="about" className="page-section">
          <p className="section-label">About</p>

          <div className="bio-grid">
            <div className="bio-text">
              I&apos;m a software engineer with a background in backend systems, large-scale data processing, and applied machine learning. I learn quickly and like to go deep. In my current role, I became the go-to expert on a pricing rules engine that handles millions of requests an hour, and I&apos;m now helping build an LLM assistant that makes it easier for others to understand.<br /><br />
              Outside of software, I volunteer as an associate editor for the New York Journal of Philosophy. I studied mathematics alongside computer science and still spend a lot of my free time on independent study in both, along with philosophy. That curiosity is a big part of how I approach engineering.
            </div>

            <div className="right-col">
              <div className="stat-row">
                <div className="stat-label">Currently</div>
                <div className="stat-value">Backend engineer on a Java rules engine serving millions of requests per hour</div>
              </div>
              <div className="stat-row">
                <div className="stat-label">Background</div>
                <div className="stat-value">BS Computer Science, Minor in Mathematics, NC State, 4.0 major GPA</div>
              </div>
              <div className="stat-row">
                <div className="stat-label">Editorial</div>
                <div className="stat-value">Associate Editor (volunteer), New York Journal of Philosophy</div>
              </div>
              <div className="stat-row">
                <div className="stat-label">Contact</div>
                <div className="stat-value">mikailjk@gmail.com</div>
              </div>
            </div>
          </div>

          <hr className="inner-divider" />

          <div style={{ marginBottom: "2.5rem" }}>
            <p className="section-label">Technical skills</p>
            <div className="skills-grid">
              <span className="skill-tag featured">Java</span>
              <span className="skill-tag featured">Python</span>
              <span className="skill-tag featured">SQL</span>
              <span className="skill-tag featured">DB2</span>
              <span className="skill-tag">Apache Spark</span>
              <span className="skill-tag">pandas</span>
              <span className="skill-tag">Databricks</span>
              <span className="skill-tag">LangGraph</span>
              <span className="skill-tag">JavaScript</span>
              <span className="skill-tag">React</span>
              <span className="skill-tag">Git</span>
            </div>
          </div>

          <hr className="inner-divider" />

          <div>
            <p className="section-label">Outside of work</p>
            <div className="outside-grid">
              <div className="outside-item">
                <div className="outside-title">Board games</div>
                <div className="outside-desc">A fan of Strategy, Euro-Style, and Deck Building games</div>
              </div>
              <div className="outside-item">
                <div className="outside-title">Speedcubing</div>
                <div className="outside-desc">Working on getting faster at solving the Rubik&apos;s cube</div>
              </div>
              <div className="outside-item">
                <div className="outside-title">Reading</div>
                <div className="outside-desc">Mostly SciFi, Philosophy, and Mathmatics, with whatever else catches my interest</div>
              </div>
            </div>
          </div>
        </section>

        <hr className="page-divider" />

        {/* ── Section 3: Fun Stuff ── */}
        <section id="funstuff" className="page-section">
          <p className="section-label">Fun stuff</p>
          <div className="funstuff-grid">
            <a href="/antsimulation" className="funstuff-card">
              <Image src={AntPic} alt="Ant Simulation" className="w-full h-auto" />
              <span className="funstuff-label">Ant Simulation</span>
            </a>
            <a href="/whereintheworld" className="funstuff-card">
              <Image src={MapPic} alt="Where in the World" className="w-full h-auto" />
              <span className="funstuff-label">Where in the World?</span>
            </a>
            <a href="/jerrymapping" className="funstuff-card">
              <Image src={JerryPic} alt="Jerry Mapping" className="w-full h-auto" />
              <span className="funstuff-label">Jerry Mapping</span>
            </a>
            <a href="https://journal.nyphilosophy.org/" target="_blank" rel="noopener noreferrer" className="funstuff-card">
              <Image src={PhilPic} alt="Philosophy Journal" objectFit="cover" />
              <span className="funstuff-label">NY Journal of Philosophy</span>
            </a>
          </div>
        </section>

      </div>
    </main>
  )
}
