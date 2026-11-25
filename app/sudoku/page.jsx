import SudokuApp from '../components/Sudoku/ui/SudokuApp.jsx';
import { listPuzzles } from '../components/Sudoku/server/db.js';

export const metadata = { title: 'Sudoku' };

// The puzzle list is refreshed when someone publishes, and at least every 10 minutes.
export const revalidate = 600;

export default async function SudokuPage() {
  const puzzles = await listPuzzles();
  return (
    <main>
      <SudokuApp puzzles={puzzles} />
    </main>
  );
}
