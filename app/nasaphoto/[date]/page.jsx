import APOD from "../APOD"
import Link from "next/link"

export default async function Nasa({ params }) {
  const date = params.date
  return (
    <main>
      <Link href="../nasaphoto">Back</Link>
      <APOD date={date} />
    </main>
  )
}
