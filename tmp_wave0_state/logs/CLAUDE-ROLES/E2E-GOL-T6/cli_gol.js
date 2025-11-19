#!/usr/bin/env node
'use strict';
const readline = require('readline');

const PRESETS = {
  glider: ['.#.', '..#', '###'],
  blinker: ['###'],
  toad: ['.###', '###.'],
  beacon: ['##..', '##..', '..##', '..##']
};

function createBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function toGrid(name) {
  const rows = PRESETS[name?.toLowerCase()] || [];
  if (rows.length === 0) {
    return createBoard(10, 10);
  }
  return rows.map((row) => row.split('').map((char) => (char === '#' ? 1 : 0)));
}

function render(board) {
  return board.map((row) => row.map((cell) => (cell ? '#' : '.')).join(' ')).join('\n');
}

function countNeighbors(board, row, col) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < board.length && c >= 0 && c < board[r].length) {
        count += board[r][c];
      }
    }
  }
  return count;
}

function step(board, iterations = 1) {
  let current = board.map((row) => row.slice());
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const rows = current.length;
    const cols = current[0].length;
    const next = createBoard(rows, cols);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const neighbors = countNeighbors(current, r, c);
        if (current[r][c]) {
          next[r][c] = neighbors === 2 || neighbors === 3 ? 1 : 0;
        } else {
          next[r][c] = neighbors === 3 ? 1 : 0;
        }
      }
    }
    current = next;
  }
  return current;
}

function toggle(board, row, col) {
  if (row < 0 || col < 0 || row >= board.length || col >= board[0].length) {
    console.log('Coordinate outside the board.');
    return board;
  }
  const clone = board.map((r) => r.slice());
  clone[row][col] = clone[row][col] ? 0 : 1;
  return clone;
}

function randomize(board, density = 0.3) {
  const clamp = Math.min(1, Math.max(0, Number(density) || 0));
  return board.map((row) => row.map(() => (Math.random() < clamp ? 1 : 0)));
}

function resize(board, rows, cols) {
  const next = createBoard(rows, cols);
  for (let r = 0; r < Math.min(rows, board.length); r += 1) {
    for (let c = 0; c < Math.min(cols, board[r].length); c += 1) {
      next[r][c] = board[r][c];
    }
  }
  return next;
}

let board = toGrid('glider');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'gol> ' });

console.log("Conway's Game of Life CLI (type 'help' for commands)");
show();
rl.prompt();

rl.on('line', (line) => {
  const [command, ...args] = line.trim().split(/\s+/);
  switch ((command || '').toLowerCase()) {
    case 'help':
      printHelp();
      break;
    case 'show':
      show();
      break;
    case 'step': {
      const iterations = Number(args[0]) || 1;
      board = step(board, iterations);
      show();
      break;
    }
    case 'run': {
      const iterations = Math.max(1, Number(args[0]) || 10);
      board = step(board, iterations);
      show();
      break;
    }
    case 'toggle': {
      const row = Number(args[0]);
      const col = Number(args[1]);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        board = toggle(board, row, col);
        show();
      } else {
        console.log('Usage: toggle <row> <col>');
      }
      break;
    }
    case 'random': {
      const density = Number(args[0]) || 0.3;
      board = randomize(board, density);
      show();
      break;
    }
    case 'clear':
      board = createBoard(board.length, board[0].length);
      show();
      break;
    case 'resize': {
      const rows = Number(args[0]);
      const cols = Number(args[1]);
      if (Number.isFinite(rows) && Number.isFinite(cols) && rows > 0 && cols > 0) {
        board = resize(board, rows, cols);
        show();
      } else {
        console.log('Usage: resize <rows> <cols>');
      }
      break;
    }
    case 'load': {
      const name = (args[0] || '').toLowerCase();
      board = toGrid(name);
      console.log(`Loaded pattern: ${PRESETS[name] ? name : 'blank canvas'}`);
      show();
      break;
    }
    case 'quit':
    case 'exit':
      rl.close();
      return;
    default:
      if (command) {
        console.log(`Unknown command: ${command}`);
      }
      printHelp();
  }
  rl.prompt();
}).on('close', () => {
  console.log('Goodbye!');
  process.exit(0);
});

function show() {
  console.log(render(board));
}

function printHelp() {
  console.log(
    'Commands:\n' +
      '  help                   Show this message\n' +
      '  show                   Render the current board\n' +
      '  step [n]               Advance n generations (default 1)\n' +
      '  run [n]                Fast-forward n generations (default 10)\n' +
      '  toggle <r> <c>         Flip a cell at row/col\n' +
      '  random [density]       Randomize board (0-1 density, default 0.3)\n' +
      '  clear                  Clear the board\n' +
      '  resize <rows> <cols>   Resize board, preserving overlap\n' +
      '  load <pattern>         Load glider/blinker/toad/beacon\n' +
      '  quit                   Exit the program'
  );
}