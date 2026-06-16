"use client"
import { useState } from "react"
import { Map, Marker } from "pigeon-maps"

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 10 km grace zone → 100 pts, then exponential decay
// ~200 km → ~45 pts, ~1000 km → ~2 pts, always at least 1
function calculateScore(distanceKm) {
  const d = Math.max(0, distanceKm - 10)
  return Math.max(1, Math.round(100 * Math.exp(-0.005 * d)))
}

function scoreColor(score) {
  if (score >= 90) return "#22c55e"
  if (score >= 70) return "#84cc16"
  if (score >= 50) return "#eab308"
  if (score >= 30) return "#f97316"
  return "#ef4444"
}

function scoreLabel(score, distanceKm) {
  if (distanceKm < 10) return "Bulls-eye!"
  if (score >= 90) return "Incredible!"
  if (score >= 70) return "Very close!"
  if (score >= 50) return "Not bad!"
  if (score >= 30) return "Getting warmer..."
  if (score >= 10) return "Way off!"
  return "Wrong continent?"
}

export default function MyMap({ data }) {
  const [pin, setPin] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [roundPoints, setRoundPoints] = useState(0)
  const [totalPoints, setTotalPoints] = useState(0)
  const [distanceKm, setDistanceKm] = useState(0)
  const [qIndex, setQIndex] = useState(1)

  const totalQuestions = data.length - 1
  const isFinished = qIndex > totalQuestions
  const currentQ = isFinished ? null : data[qIndex]
  const answerLatLng =
    submitted && currentQ
      ? [parseFloat(currentQ[1]), parseFloat(currentQ[2])]
      : null

  function handleMapClick(event) {
    if (!submitted) setPin(event.latLng)
  }

  function handleSubmit() {
    if (!pin || !currentQ) return
    const dist = haversineKm(pin[0], pin[1], parseFloat(currentQ[1]), parseFloat(currentQ[2]))
    const score = calculateScore(dist)
    setDistanceKm(Math.round(dist))
    setRoundPoints(score)
    setTotalPoints(prev => prev + score)
    setSubmitted(true)
  }

  function handleNext() {
    setQIndex(prev => prev + 1)
    setPin(null)
    setSubmitted(false)
    setRoundPoints(0)
    setDistanceKm(0)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] h-[70vh] w-full gap-2 p-2 bg-[#0f1115]">

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-[#2a2d33] min-h-[40vh] lg:min-h-0">
        <Map
          defaultCenter={[20, 10]}
          defaultZoom={2}
          onClick={handleMapClick}
          twoFingerDrag={true}
        >
          {pin && <Marker width={40} anchor={pin} color="#3b82f6" />}
          {answerLatLng && <Marker width={40} anchor={answerLatLng} color="#22c55e" />}
        </Map>
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-2 overflow-y-auto">

        {/* Total score */}
        <div className="bg-[#16191c] border border-[#2a2d33] rounded-xl px-4 py-2 text-center shrink-0">
          <p className="text-[#777] text-xs uppercase tracking-widest">Total Score</p>
          <p className="text-3xl font-bold text-white leading-tight">{totalPoints}</p>
          <p className="text-[#777] text-xs">/ {100 * totalQuestions}</p>
        </div>

        {/* Progress bar */}
        {!isFinished && (
          <div className="bg-[#16191c] border border-[#2a2d33] rounded-xl px-3 py-2 shrink-0">
            <div className="flex justify-between text-xs text-[#777] mb-1">
              <span>Progress</span>
              <span>{qIndex - 1} / {totalQuestions}</span>
            </div>
            <div className="w-full bg-[#2a2d33] rounded-full h-1">
              <div
                className="bg-blue-500 h-1 rounded-full transition-all duration-500"
                style={{ width: `${((qIndex - 1) / totalQuestions) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Question */}
        {!isFinished && currentQ && (
          <div className="bg-[#16191c] border border-[#2a2d33] rounded-xl p-3 flex-1 flex flex-col justify-center">
            <p className="text-[#777] text-xs uppercase tracking-widest mb-1.5">
              Question {qIndex} of {totalQuestions}
            </p>
            <p className="text-white text-sm leading-relaxed">{currentQ[0]}</p>
          </div>
        )}

        {/* Game over */}
        {isFinished && (
          <div className="bg-[#16191c] border border-[#2a2d33] rounded-xl p-4 flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-xl font-bold text-white mb-1">Game Over!</p>
            <p className="text-[#777] text-xs mb-2">Final Score</p>
            <p className="text-5xl font-bold text-white">{totalPoints}</p>
            <p className="text-[#777] text-xs mt-1">out of {100 * totalQuestions}</p>
          </div>
        )}

        {/* Submit / Result */}
        {!isFinished && (
          <div className="bg-[#16191c] border border-[#2a2d33] rounded-xl p-3 shrink-0">
            {!submitted ? (
              <>
                <p className="text-[#777] text-xs text-center mb-2">
                  {pin
                    ? `📍 ${pin[0].toFixed(4)}°, ${pin[1].toFixed(4)}°`
                    : "Click the map to place your guess"}
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={!pin}
                  className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors
                    disabled:opacity-25 disabled:cursor-not-allowed
                    bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white"
                >
                  Submit Guess
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-2">
                  <p className="text-[#777] text-xs uppercase tracking-widest">Round Score</p>
                  <p className="text-4xl font-bold leading-tight" style={{ color: scoreColor(roundPoints) }}>
                    {roundPoints}
                  </p>
                  <p className="text-xs font-medium" style={{ color: scoreColor(roundPoints) }}>
                    {scoreLabel(roundPoints, distanceKm)}
                  </p>
                  <p className="text-[#777] text-xs mt-1">
                    {distanceKm < 10
                      ? "You were right on it!"
                      : `${distanceKm.toLocaleString()} km from the answer`}
                  </p>
                  <p className="text-[#555] text-xs">Green marker = correct location</p>
                </div>
                <button
                  onClick={handleNext}
                  className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors
                    bg-[#23272e] hover:bg-[#2e333b] border border-[#3a3d43] text-white"
                >
                  Next Question →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
