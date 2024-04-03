import Image from "next/image"

async function getData(date) {
  const key = process.env.NASA_API_KEY
  const query = 'https://api.nasa.gov/planetary/apod?api_key=' + key + "&date=" + date
  const res = await fetch(query, {
    next: {
      revalidate: 60
    }
  })

  return res.json()
}

export default async function APOD(props) {

  const res = await getData(props.date)

  return (
    <main className="min-h-screen grid justify-items-center">
      <div className="">
        <h2 >{res.title}</h2>
        < Image src={res.hdurl} alt="Image" width={500} height={500} />
        <p>{res.explanation}</p>
      </div>

    </main>

  )
}
