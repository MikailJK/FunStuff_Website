import { google } from "googleapis"

export const revalidate = 0

export const getSheetsData = async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  })

  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() })
  const range = "Sheet1!A:C"

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range
    })
    return response.data.values
  } catch (error) {
    console.error("Error fetching sheets data:", error)
    return []
  }
}
