import MyMap from "../components/MyMap"

export default function Where() {
  return (
    <main className="flex place-items-center">
      <MyMap />
      <h1>Where is my home town?</h1>
      {/* <Map height={500} width={500} defaultCenter={[50.879, 4.6997]} defaultZoom={11} > */}
      {/* </Map > */}
    </main >
  )
}
