import Image from "next/image"

async function getData(date) {
  const key = process.env.NASA_API_KEY
  const res = await fetch(
    `https://api.nasa.gov/planetary/apod?api_key=${key}&date=${date}`,
    { next: { revalidate: 60 } }
  )

  if (!res.ok) throw new Error(`NASA API returned ${res.status}`)
  return res.json()
}

export default async function APOD({ date }) {
  let data

  try {
    data = await getData(date)
  } catch {
    return (
      <p className="text-center text-red-400 py-10">
        Failed to load data for {date}. The NASA API may be unavailable.
      </p>
    )
  }

  if (data.error) {
    return (
      <p className="text-center text-red-400 py-10">
        {data.error.message || "Invalid date or API error."}
      </p>
    )
  }

  return (
    <div className="max-w-3xl mx-auto grid gap-6 px-4 py-8">
      <h2 className="text-2xl font-semibold text-center">{data.title}</h2>
      <p className="text-sm text-gray-400 text-center">{date}</p>

      {data.media_type === "video" ? (
        <div className="aspect-video w-full">
          <iframe
            src={data.url}
            title={data.title}
            className="w-full h-full rounded"
            allowFullScreen
          />
        </div>
      ) : (
        <Image
          src={data.hdurl || data.url}
          alt={data.title}
          width={1200}
          height={800}
          className="rounded w-full h-auto object-contain"
          unoptimized
        />
      )}

      <p className="leading-relaxed">{data.explanation}</p>

      {data.copyright && (
        <p className="text-sm text-gray-500 text-right">© {data.copyright}</p>
      )}
    </div>
  )
}
