import Link from "next/link"
import Image from "next/image"
import ProfPic from "../components/profile.png"


export default function About() {
  return (
    <main className="">
      <div className="scrollbar-hide">
        <div className="">



          <div className="grid grid-cols-1 sm:grid-cols-3 gap-9 items-center">

            <Image src={ProfPic} alt="Map Image" className="max-w-full" />

            <div className="col-span-2">
              <p>
                Hello!<br></br> I&apos;m Mikail, a Computer Scientist based in New York City. My expertise includes machine learning, automation, and distributed cloud computing. <br></br><br></br>

                Continuous learning is a core value of mine, and I am dedicated to expanding my knowledge and expertise in computer science. Outside of work, I like to pursue my passion for intellectual challenges. You might find me playing board games, improving my Rubik&apos;s cube solving speed, or reading an exciting book.<br></br><br></br>

                I am always seeking opportunities to collaborate with like-minded professionals and contribute to exciting projects that push the boundaries of technology. Let&apos;s connect and explore how we can make a positive impact together!
              </p>

            </div>


            <div className="col-span-3 ">
              <div><h2>Skills</h2></div>


              <div className="grid grid-cols-4">
                <ul>
                  <li><b>Python</b></li>
                  <li><b>Java</b></li>
                  <li><b>JavaScript</b></li>
                </ul>
                <ul>
                  <li><b>C++</b></li>
                  <li><b>C#</b></li>
                  <li><b>Unity</b></li>
                </ul>
                <ul>
                  <li><b>Git</b></li>
                  <li><b>Visual Studio Code</b></li>
                  <li><b>React</b></li>
                </ul>
                <ul>
                  <li><b>Microsoft Azure</b></li>
                  <li><b>Databricks</b></li>
                  <li><b>PySpark</b></li>
                </ul>
              </div>

            </div>


          </div>

        </div>
      </div>
    </main >
  )
}
