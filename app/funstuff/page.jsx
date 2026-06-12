import Image from "next/image"
import Nasa from "../components/nasa.png"
import MapPic from "../components/map.png"
import AntPic from "../components/ants.png"
import PhilPic from "../components/phil.png"

export default function funstuff() {
  return (
    <main>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2  gap-y-2">
        
        <a href="./antsimulation" className="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          <Image src={AntPic} alt="Map Image" className="w-full h-auto" />
        </a>
        <a href="./whereintheworld" className="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden relative">
          <Image src={MapPic} alt="Map Image" className="w-full h-auto" />
        </a>
        <a href="./nasaphoto" className="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          <Image src={Nasa} alt="Nasa Images" objectFit="cover" />
        </a>
        <a href="https://journal.nyphilosophy.org/" target="_blank" rel="noopener noreferrer" className="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          
          <Image src={PhilPic} alt="Nasa Images" objectFit="cover" />
        </a>
      </div>
    </main >
  )
}
