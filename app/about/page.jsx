import Link from "next/link"
import Image from "next/image"
import ProfPic from "../components/profile.png"

export default function About() {
  return (
    <main>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');

        .about-root {
          color: #e8e8e4;
          font-family: 'Inter', sans-serif;
          font-weight: 400;
          padding: 3rem 2rem 4rem;
          box-sizing: border-box;
        }

        .name-block {
          margin-bottom: 3rem;
          border-bottom: 0.5px solid #2a2a2a;
          padding-bottom: 2rem;
        }

        .tagline {
          font-size: 13px;
          font-weight: 400;
          color: #666;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .bio-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          margin-bottom: 3rem;
        }

        @media (max-width: 640px) {
          .bio-grid {
            grid-template-columns: 1fr;
          }
        }

        .bio-text {
          font-size: 15px;
          line-height: 1.85;
          color: #b0aca4;
          font-weight: 300;
        }

        .bio-text em {
          color: #e8e8e4;
          font-style: normal;
          font-weight: 400;
        }

        .right-col {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .stat-row {
          border-left: 1px solid #2a2a2a;
          padding-left: 1.25rem;
        }

        .stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #444;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 14px;
          color: #c8c4bc;
          font-weight: 400;
          line-height: 1.5;
        }

        .about-divider {
          border: none;
          border-top: 0.5px solid #1e1e1e;
          margin: 2.5rem 0;
        }

        .section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #444;
          margin-bottom: 1.25rem;
        }

        .skills-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .skill-tag {
          font-size: 12px;
          color: #888;
          border: 0.5px solid #222;
          border-radius: 2px;
          padding: 5px 12px;
          letter-spacing: 0.04em;
          transition: color 0.2s, border-color 0.2s;
        }

        .skill-tag:hover {
          color: #c8c4bc;
          border-color: #3a3a3a;
        }

        .skill-tag.featured {
          color: #c8c4bc;
          border-color: #333;
        }

        .outside-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: #1a1a1a;
          border: 0.5px solid #1a1a1a;
          border-radius: 4px;
          overflow: hidden;
        }

        @media (max-width: 640px) {
          .outside-grid {
            grid-template-columns: 1fr;
          }
        }

        .outside-item {
          background: #0e0e0e;
          padding: 1rem 1.25rem;
        }

        .outside-title {
          font-size: 13px;
          color: #c8c4bc;
          margin-bottom: 4px;
          font-weight: 500;
        }

        .outside-desc {
          font-size: 12px;
          color: #555;
          line-height: 1.6;
        }
      `}</style>

      <div className="about-root">

        <div className="name-block">
          <p className="tagline">Software Engineer &nbsp;·&nbsp; New York City</p>
        </div>

        <div className="bio-grid">
          <div className="bio-text">
            I&apos;m a software engineer with a background spanning <em>backend systems, distributed computing, and applied machine learning</em>. I thrive in environments where there&apos;s a lot to learn, I pick things up quickly and go deep, whether that&apos;s mastering a new codebase or becoming a go-to resource for the team on a complex domain.<br /><br />
            Outside of software, I volunteer as an associate editor for a community-focused philosophy journal. I&apos;m drawn to independent study across mathematics, philosophy, and computer science, and bring that same curiosity into my technical work.
            </div>

          <div className="right-col">
            <div className="stat-row">
              <div className="stat-label">Currently</div>
              <div className="stat-value">Software Engineer, enterprise-scale backend APIs and qualification systems</div>
            </div>
            <div className="stat-row">
              <div className="stat-label">Background</div>
              <div className="stat-value">BS Computer Science, NC State — 4.0 major GPA</div>
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

        <hr className="about-divider" />

        <div style={{ marginBottom: "2.5rem" }}>
          <p className="section-label">Technical skills</p>
          <div className="skills-grid">
            <span className="skill-tag featured">Java</span>
            <span className="skill-tag featured">Spring Boot</span>
            <span className="skill-tag featured">Python</span>
            <span className="skill-tag featured">Apache Spark</span>
            <span className="skill-tag featured">SQL</span>
            <span className="skill-tag featured">Maven</span>
            <span className="skill-tag">JavaScript</span>
            <span className="skill-tag">React</span>
            <span className="skill-tag">C++</span>
            <span className="skill-tag">C#</span>
            <span className="skill-tag">Databricks</span>
            <span className="skill-tag">Git</span>
            <span className="skill-tag">NLP / LLM tooling</span>
          </div>
        </div>

        <hr className="about-divider" />

        <div>
          <p className="section-label">Outside of work</p>
          <div className="outside-grid">
            <div className="outside-item">
              <div className="outside-title">Board games</div>
              <div className="outside-desc">A fan of strategy games and the occasional ruthless negotiation</div>
            </div>
            <div className="outside-item">
              <div className="outside-title">Speedcubing</div>
              <div className="outside-desc">Working on getting faster at solving the Rubik&apos;s cube</div>
            </div>
            <div className="outside-item">
              <div className="outside-title">Reading</div>
              <div className="outside-desc">Mostly philosophy and computer science, with whatever else catches my interest</div>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
