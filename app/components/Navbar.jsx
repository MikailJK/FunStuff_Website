import Link from "next/link"

export default function Navbar() {
  return (
    <nav>
      <h1 class="text-3xl pl-5">Mikail Krochta</h1>
      <div class="justify-self-end grid grid-flow-col mx-5">
        <Link href="./">Home</Link>
        <Link href="./about">About</Link>
        <Link href="https://www.linkedin.com/in/mikail-krochta-1216691a2/" target="_blank">
          <span class="[&>svg]:h-6 [&>svg]:w-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 -20 448 512">
              <path
                d="M100.3 448H7.4V148.9h92.9zM53.8 108.1C24.1 108.1 0 83.5 0 53.8a53.8 53.8 0 0 1 107.6 0c0 29.7-24.1 54.3-53.8 54.3zM447.9 448h-92.7V302.4c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7V448h-92.8V148.9h89.1v40.8h1.3c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3V448z" />
            </svg>
          </span>
        </Link>
      </div>
    </nav >
  )
}
