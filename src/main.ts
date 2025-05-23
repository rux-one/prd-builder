import fs from 'fs';
import rl from 'readline';

let document = ''

const input = rl.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
})

const SYSTEM_MESSAGE_PATH = './system_message.md';
const QUESTIONS_PATH = './questions.md';

function loadFileContent(filePath: string): string {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  return fileContent
}

let systemPrompt = loadFileContent(SYSTEM_MESSAGE_PATH)
let questions = loadFileContent(QUESTIONS_PATH).split('---')

function writeFileContent(content: string) {
  fs.writeFileSync('./output.md', content)
}

console.log(questions[0])

async function askQuestion(question: string) {
  return new Promise((resolve, reject) => {
    input.question(question, (answer) => {
      //console.log(`You said: ${answer}`)
      resolve(answer)
    });
  })
}

async function main() {
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    const answer = await askQuestion(question)
    //systemPrompt = systemPrompt.replace('$$QUESTION$$', question)
    //systemPrompt = systemPrompt.replace('$$ANSWER$$', answer)
    //console.log(answer)
    document += question + '\n' + answer + '\n'
  }

  writeFileContent(document)
  process.exit(0)
}

main()
