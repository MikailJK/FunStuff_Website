import Image from "next/image"
import Nasa from "../components/nasa.png"
import MapPic from "../components/map.png"

export default function funstuff() {
  return (
    <main>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-2  gap-y-2">
        <a href="./nasaphoto" class="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          <Image src={Nasa} alt="Nasa Images" objectFit="cover" />
        </a>
        <a href="./whereintheworld" class="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden relative">
          <Image src={MapPic} alt="Map Image" className="w-full h-auto" />
        </a>
        <a href="./nasaphoto" class="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          {/* <Image src={Nasa} alt="Nasa Images" objectFit="cover" /> */}
          Coming soon...
        </a>
        <a href="./nasaphoto" class="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          {/* <Image src={Nasa} alt="Nasa Images" objectFit="cover" /> */}
          Coming soon...
        </a>
      </div>
    </main >
  )
}
