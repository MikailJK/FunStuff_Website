import Image from "next/image"
import Nasa from "../components/nasa.png"

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
        <a href="./" class="bg-[#1D2125] rounded-xl h-[200px] flex items-center justify-center">helo</a>
        <a href="./" class="bg-[#1D2125] rounded-xl h-[200px] flex items-center justify-center">helo</a>
        <a href="./nasaphoto" class="bg-[#1D2125]
          rounded-xl
          h-[200px]
          flex items-center
          justify-center overflow-hidden">
          <Image src={Nasa} alt="Nasa Images" objectFit="cover" />
        </a>
      </div>
    </main >
  )
}
