"use client"
import { useState } from "react"
import { Map, Marker } from "pigeon-maps"


export default function MyMap({ data }) {


  const [latlong, setLatlong] = useState("")
  const [pinDropped, setPinDropped] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [totalPoints, setTotalPoints] = useState(0)
  const [points, setPoints] = useState(0)
  const [qIndex, setQIndex] = useState(1)
  const answer = [41.3362, -75.9631]

  function handleClick(event) {
    setLatlong(event.latLng)
    setPinDropped(true)
    console.log(event.latLng)
  }

  function handleSubmit() {
    let dx = Math.abs(data[qIndex][1] - latlong[0])
    let dy = Math.abs(data[qIndex][2] - latlong[1])
    let distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2))
    let score = Math.max(0, Math.round(100 - (distance * 150)))
    setPoints(score)
    setTotalPoints(totalPoints + score)
    if (score > 0) {
      setQIndex(qIndex + 1)
    }
    console.log({ score })
    setSubmitted(true)
  }

  return (
    <main className="grid grid-cols-1 lg:grid-cols-2 place-items-center gap-x-9">
      <div className="">
        <Map height={500} width={500} twoFingerDrag={true} defaultCenter={[49, 8.5]} defaultZoom={4} onClick={handleClick}>
          {pinDropped && (

            <Marker
              width={50}
              anchor={latlong}
              color={"#aaaaaa"}
            // onClick={() => setHue(hue + 20)}
            />
          )}
        </Map>
        <h1 className="text-4xl">Points: {totalPoints}</h1>
      </div>
      <div className="h-full grid grid-cols-1 grid-rows-4 place-content-stretch">
        <p className="text-center">Place a pin on the map as close as you can to the answer.</p>
        {qIndex < data.length && (
          < h1 className="text-center">{data[qIndex][0]}</h1>
        )}
        {qIndex >= data.length && (
          <>
            <h1 className="text-center">Thanks for playing!</h1>
            <h1 className="text-center">Final Score: {totalPoints}/{100 * (data.length - 1)}</h1>
          </>
        )}
        {pinDropped && qIndex < data.length && (
          <div className="flex place-self-center">
            <h1 className="pl-5">Lat: {Math.round(latlong[0] * 10000) / 10000}</h1>
            <h1 className="pl-5">Long: {Math.round(latlong[1] * 10000) / 10000}</h1>
            <button onClick={handleSubmit} className="pl-5 w-full">
              <div className="bg-zinc-300 rounded">
                <h6 className="text-black">Submit</h6>
              </div>
            </button>
          </div>
        )}
        {submitted && points > 0 && (
          <h1 className="place-self-center"> You got: {points} points out of 100!</h1>
        )}
        {submitted && points <= 0 && (
          <h1 className="place-self-center"> You got: {points} points, you can do better!</h1>
        )}
      </div>


    </main >

  )
}
