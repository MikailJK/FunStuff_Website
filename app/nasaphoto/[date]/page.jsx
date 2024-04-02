import APOD from "../APOD"
import Link from "next/link"

export default async function Nasa({ params }) {
  const date = params.date
  return (
    <main className="min-h-screen grid grid-cols-1 justify-items-center place-content-start">
      <Link href="../nasaphoto">Back</Link>
      <APOD date={date} />
    </main>
  )
}
