import MyMap from "./MyMap"
import { getSheetsData } from "../_lib/readSheet"

export const revalidate = 0

export default async function Where() {
  const data = await getSheetsData()

  return (
    <main className=" flex">
      <MyMap data={data} />
      {/* <Map height={500} width={500} defaultCenter={[50.879, 4.6997]} defaultZoom={11} > */}
      {/* </Map > */}
    </main >
  )
}
