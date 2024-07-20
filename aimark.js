/****************************************************************************
 ** The Heading class stores information about a spreadsheet column.       **
 ****************************************************************************/

class Heading {
    constructor(title, column) {
        this.title = title      // The title of the column.
        this.column = column    // The index of the column.
        this.hasScore = false   // If true, the next column stores the score.
    }
}

/****************************************************************************
 ** The Entry class stores a student's response to a question.             **
 ****************************************************************************/

class Entry {
    constructor(value) {
        this.value = value
        this.score = null
    }

    setScore(score) {
        this.score = score
    }
}

/****************************************************************************
 ** The Table class holds spreadsheet data of student answers and scores.  **
 ****************************************************************************/

class Table {
    static createFromText(text) {
        const lines = text.split("\n").map(line => line.trim())
        const headerFields = lines.shift().split("\t")
        const table = new Table(headerFields)

        for (let line of lines) {
            if (line === "") break
            const fields = line.split("\t")
            table.addRecord(fields)
        }

        return table
    }

    constructor(headerFields) {
        this.headings = this.parseHeaderFields(headerFields ?? [])
        this.records = []
    }

    parseHeaderFields(fields) {
        const headings = []

        for (let column = 0; column < fields.length; column += 1) {
            const rawHeading = fields[column]
            if (rawHeading !== "score") {
                const heading = new Heading(rawHeading, column)
                headings.push(heading)
            } else if (headings.length > 0) {
                headings[headings.length - 1].hasScore = true
            }
        }

        return headings
    }

    addRecord(fields) {
        const record = []

        for (const heading of this.headings) {
            const value = fields[heading.column]
            const entry = new Entry(value)
            if (heading.hasScore) {
                const score = parseInt(fields[heading.column + 1])
                if (!Number.isNaN(score)) entry.setScore(score)
            }
            record.push(entry)
        }

        this.records.push(record)
    }

    toString() {
        const headings = []
        for (const heading of this.headings) {
            headings.push(heading.title, "score")
        }

        const records = [ headings.join("\t") ]
        for (const record of this.records) {
            const line = []
            for (const entry of record) {
                line.push(entry.value, entry.score !== null ? entry.score : "?")
            }
            records.push(line.join("\t"))
        }

        return records.join("\n")
    }
}

/****************************************************************************
 ** The Lm class interfaces with a language model.                         **
 ****************************************************************************/

class Lm {
    constructor(name, url, key, model) {
        this.name = name
        this.url = url
        this.key = key
        this.model = model
        this.cache = new Map()
    }

    save() {
        const json = JSON.stringify({
            url: this.url, key: this.key, model: this.model
        })
        window.localStorage?.setItem(`lm-${this.name}`, json)
    }

    restore() {
        const json = window.localStorage?.getItem(`lm-${this.name}`)
        try {
            const obj = JSON.parse(json)
            if (obj.url) this.url = obj.url
            if (obj.key) this.key = obj.key
            if (obj.model) this.model = obj.model
        } catch (e) {}
        return this
    }

    async ask(text) {
        const cachedResult = this.cache.get(text)
        if (cachedResult !== undefined) return cachedResult

        const request = {
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: "You are a teacher of computer science in a UK high school.",
                },
                { role: 'user', content: text },
            ],
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.key}`
        }

        try {
            const response = await window.fetch(this.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            })
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const content = data.choices[0].message.content;
            this.cache.set(text, content)
            return content
        } catch (e) {
            console.error('Error:', e);
            return `Error: ${error.message}`;
        }
    }

    async askJson(text, startMarker = "{", endMarker = "}") {
        const response = await this.ask(text)
        const start = response.indexOf(startMarker)
        const end = response.lastIndexOf(endMarker) + endMarker.length
        const json = response.substring(start, end)

        try {
            const result = JSON.parse(json)
            console.log(`Lm returned:`, result)
            return result
        } catch (e) {
            return null
        }
    }

    toString() {
        return this.name
    }
}

/****************************************************************************
 ** The Assessor class itemises marking criteria and calculates scores.    **
 ****************************************************************************/

class Assessor {
    constructor(text) {
        this.descriptions = []
        this.scores = []

        for (let line of text.split("\n")) {
            line = line.trim()
            if (line === "") continue
            this.descriptions.push(line)
            this.scores.push(1)
        }
    }

    isEmpty() {
        return this.descriptions.length === 0
    }

    assess(ids) {
        let score = 0
        for (const id of ids) {
            if (id >= 1 && id <= this.descriptions.length) {
                score += this.scores[id - 1]
            }
        }
        return score
    }

    toString() {
        const lines = []
        for (const [index, text] of this.descriptions.entries()) {
            lines.push(`${index + 1}: ${text}\n`)
        }
        return lines.join("")
    }
}

/****************************************************************************
 ** Main module                                                            **
 ****************************************************************************/

const globals = {
    table: new Table(),
    lm: null,
    lms: [
        new Lm(
            "custom",
            "http://localhost:11434/v1/chat/completions",
            "",
            "llama3").restore(),
        new Lm(
            "OpenAI GPT4o",
            "https://api.openai.com/v1/chat/completions",
            "",
            "gpt-4o").restore(),
    ],
}

function setLm(index) {
    const lm = globals.lms[index]
    globals.lm = lm
    u("#lm-url-input").first().value = lm.url
    u("#lm-key-input").first().value = lm.key
    u("#lm-model-input").first().value = lm.model
}

async function assessResponse(entry) {
    const markscheme = u("#markscheme-textarea").first().value.trim()
    const maxScore = parseInt(u("#maxscore-input").first().value)
    const assessor = new Assessor(markscheme)

    if (assessor.isEmpty()) return null

    const text = `
    The student responded to the question with the following text, delimited by triple quotes:

    """
    ${entry.value}
    """

    Please assess which of the numbered criteria below are met by the student's response:

    ${assessor}

    Your response should be a JSON array containing integers, where each integer corresponds
    to a criterion in the list which has been satisfied.
    If no criteria are satisfied, respond with an empty array.
    `.replace(/^    /g, "")

    const response = await globals.lm.askJson(text, "[", "]")
    if (!Array.isArray(response)) return null
    const score = assessor.assess(response)
    return Math.min(maxScore, score)
}

async function onClickScore(table, column) {
    const heading = table.headings[column]
    const $tbody = u("#data-tbody")

    for (let row = 0; row < table.records.length; row += 1) {
        const record = table.records[row]
        const entry = record[column]
        if (entry.score === null) {
            const score = await assessResponse(entry)
            if (score !== null) {
                entry.score = score
                const $td = $tbody.find(`[data-row="${row}"]`).find(`[data-col="${column}"]`)
                $td.text(entry.score !== null ? entry.score : "?")
            }
        }
    }
}

function refreshTable(table = undefined) {
    const maxLength = 50

    const $thead = u("#data-thead")
    $thead.empty()
    const $tbody = u("#data-tbody")
    $tbody.empty()

    if (!table) {
        u("#paste-banner").removeClass("hidden")
    } else {
        u("#paste-banner").addClass("hidden")

        for (const [index, heading] of table.headings.entries()) {
            const $cell = u("<th>")
            $cell.text(heading.title)
            $thead.append($cell)
            $thead.append(`<th><button value="${index}">Score</button></th>`)
            $thead.find("button").on("click", function(event) {
                onClickScore(globals.table, event.target.value)
            })
        }

        for (const [row, record] of table.records.entries()) {
            const $row = u(`<tr data-row="${row}">`)
            for (const [column, entry] of record.entries()) {
                const $valueCell = u("<td>")
                let abbreviatedValue = entry.value
                if (abbreviatedValue.length > maxLength) {
                    abbreviatedValue = abbreviatedValue.substring(0, maxLength - 3) + "..."
                }
                $valueCell.text(abbreviatedValue)
                $row.append($valueCell)

                const $scoreCell = u(`<td data-col="${column}">`)
                $scoreCell.text(entry.score ?? "?")
                $row.append($scoreCell)
            }
            $tbody.append($row)
        }
    }
}

window.addEventListener("load", function() {
    const lmSelect = u("#lm-select")

    for (const [index, lm] of globals.lms.entries()) {
        lmSelect.append(`<option value="${index}">${lm.name}</option>`)
        setLm(index)
    }

    lmSelect.on("change", function(event) {
        const index = event.target.value
        setLm(index)
    })

    u("#lm-fieldset input").on("change", function(event) {
        const lm = globals.lm
        lm.url = u("#lm-url-input").first().value.trim()
        lm.key = u("#lm-key-input").first().value.trim()
        lm.model = u("#lm-model-input").first().value.trim()
        lm.save()
    })

    u("#data-view").on("paste", function(event) {
        const text = (event.clipboardData || window.clipboardData).getData("text")
        globals.table = Table.createFromText(text)
        refreshTable(globals.table)
    })

    u("#toClip-button").on("click", async function(event) {
        const text = globals.table.toString()
        await navigator.clipboard.writeText(text);
    })

    u("#fromClip-button").on("click", async function(event) {
        if (navigator?.clipboard?.readText) {
            const text = await navigator.clipboard.readText()
            globals.table = Table.createFromText(text)
            refreshTable(globals.table)
        } else {
            console.log("Can't read clipboard directly in Firefox...")
            refreshTable()
        }
    })

    u(".help-button").on("click", function(event) {
        u("#help-popup").toggleClass("hidden")
    })

    setLm(0)
})
