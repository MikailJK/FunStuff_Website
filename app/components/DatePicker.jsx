"use client"
import React, { useState } from "react"; import Datepicker from "react-tailwindcss-datepicker";

const DatePicker = ({ dateChange }) => {
  // const [value, setValue] = useState("");
  const [value, setValue] = useState({
    startDate: null,
    endDate: null
  });

  const handleValueChange = (event) => {
    // event.preventDefault()
    // console.log("newValue:", event.target.value);
    setValue(event);
    dateChange(event.startDate);
    // handleSubmit()
  }

  return (
    <div>
      <form>
        <Datepicker
          useRange={false}
          asSingle={true}
          value={value}
          readOnly={true}
          onChange={handleValueChange}
          minDate={new Date("1999-06-16")}
          maxDate={new Date()}
        />
      </form>
    </div>
  );
};

export default DatePicker;
