import * as fs from "fs";
import pgStructure from "pg-structure";

const INCLUDED_SCHEMAS = ["static", "security", "public"];

const HEURISTICS: [RegExp][] = [
    [/RETURNS (?<type>[a-z_]+)/g],
    [/(?<!DISTINCT )FROM (?<from>[\.a-z_]+)/g],
    [/JOIN (?<join>[\.a-z_]+)/g],
    [/::(?<type>[\.A-Z_]+)/g],
]

const ensureDirExistsForFile = (s: string) => {
    const sparts = s.split("/");
    let curr = sparts[0];
    for (let i = 1; i < sparts.length; i++) {
        try {
            fs.mkdirSync(curr)
        } catch (err) {
            // ignore
        }
        curr = curr + "/" + sparts[i];
    }
}

const extractDependencies = (source?: string) => {
    if (!source) return [];

    let result: string[] = [];

    HEURISTICS.forEach(([regex]) => {
        let res: RegExpExecArray | null = null;
        while (res = regex.exec(source)) {
            Object.keys(<any>res.groups).forEach((type: string) => {
                const referent = (<any>res).groups[type];
                result.push(`${type}.${referent}`)
            })
        }
    });

    return result;
}

const getAnnotatedSource = (source?: string) => {
    if (!source) return "";

    const dependencies = extractDependencies(source);

    const header = `/*
def {
  depends_on = [
    ${dependencies.map(x => `    "${x}"`).join(",\n")}
  ]
}
*/
`;
    return header + source;
}


const doIt = (type: string) => (obj: any) => {
    const group = obj.schema.name == "public" ? "" : `${obj.schema.name}/`;
    const name = obj.name;

    const filename = `db/app/${group}${name}.${type}.sql`;

    return {
        filename,
        builtin: obj.source == null || obj.language == "c" || obj.language == "internal",
        source: getAnnotatedSource(obj.source)
    };
};

export const cmdExport = async () => {
    if (!process.env.DB_URL) {
        throw new Error("you must have a DB_URL")
    }

    const DB_URL = process.env.DB_URL;
    console.log("init " + DB_URL);

    const db = await pgStructure(DB_URL, {
        includeSchemas: INCLUDED_SCHEMAS,
    });


    db.schemas.forEach((schema) => {
        console.log(`Exporting schema ${schema.name}...`);

        let result = [];
        result.push(
            ...schema.views.map(doIt("view")),
            ...schema.materializedViews.map(doIt("matereialized")),
            ...schema.functions.map(doIt("func"))
            //normalFunctions
            //procedures
            //aggregateFunctions
            //windowFunctions
            //types
        );

        result.forEach(({ filename, builtin, source }) => {
            if (!builtin) {
                ensureDirExistsForFile(filename);
                fs.writeFileSync(filename, source);
                console.log(`   writing ${filename}`)
            }
        })
    })
}
