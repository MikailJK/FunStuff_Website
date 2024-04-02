"use client"
import DatePicker from "../components/DatePicker"
import React, { useState } from "react";
import Link from "next/link"


export default function Nasa() {


  const [date, setDate] = useState("");

  const handleDateChange = (value) => {

    setDate(value)
  }



  return (
    <main className="min-h-screen grid grid-cols-1 justify-items-center place-content-start">
      <DatePicker dateChange={handleDateChange} />
      <Link href={"./nasaphoto/" + date} >Submit</Link>
    </main >
  )
}
