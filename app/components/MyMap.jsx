"use client"
import { useState } from "react"
import { Map, Marker } from "pigeon-maps"



export default function MyMap() {

  const [latlong, setLatlong] = useState("")
  const [pinDropped, setPinDropped] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [points, setPoints] = useState(0)
  const answer = [41.3362, -75.9631]

  function handleClick(event) {
    setLatlong(event.latLng)
    setPinDropped(true)
    console.log(event.latLng)
  }

  function handleSubmit() {
    setPoints(Math.max(0, Math.round(10 - (Math.abs(answer[0] - latlong[0]) * 50))))
    setSubmitted(true)
  }

  return (
    <main>
      <h1>Points: {points}</h1>
      <Map height={500} width={500} defaultCenter={[49, 8.5]} defaultZoom={4} onClick={handleClick}>
        {pinDropped && (

          <Marker
            width={50}
            anchor={latlong}
            color={"#aaaaaa"}
          // onClick={() => setHue(hue + 20)}
          />
        )}
      </Map>
      {pinDropped && (
        <div className="flex">
          <h1 className="pl-5">Lat: {Math.round(latlong[0] * 10000) / 10000}</h1>
          <h1 className="pl-5">Long: {Math.round(latlong[1] * 10000) / 10000}</h1>
          <button onClick={handleSubmit} className="pl-5 w-full">
            <div className="bg-zinc-300 rounded">
              <h6 className="text-black">Submit</h6>
            </div>
          </button>
        </div>
      )}

      {submitted && (
        <h1> You got: {points} points out of 100!</h1>
      )}
    </main>

  )
}
