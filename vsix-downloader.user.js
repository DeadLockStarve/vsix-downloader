// ==UserScript==
// @name			VSIX Downloader
// @description	Let Download manually visual studio extensions
// @version			1.0
// @namespace		none
// @match			https://marketplace.visualstudio.com/items?itemName=*
// @grant			none
// ==/UserScript==

///@ts-check
///<reference lib="DOM" />
const Timeout = 140;
const UrlPattern = ".visualstudio.com";
const SsrRegex = /[?&]ssr=false\b/;

class Handler {
    constructor(PublisherName, Identifier, DefaultVersion, DisplayName) {
        this.PublisherName = PublisherName;
        this.Identifier = Identifier;
        this.DefaultVersion = DefaultVersion;
        this.DisplayName = DisplayName;
    }

    getDownloadUrl(Version = this.DefaultVersion) {
        return [
            "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/",
            this.PublisherName,
            "/vsextensions/",
            this.Identifier,
            "/",
            Version,
            "/vspackage"
        ].join("");
    }

    getFileName(Version = this.DefaultVersion) {
        return [this.Identifier, "_", Version, ".vsix"].join("");
    }

    getDownloadAnchor(Version = this.DefaultVersion) {
        let url = this.getDownloadUrl(Version);
        let dwAnchor = document.createElement("a");
        dwAnchor.href = url;
        dwAnchor.target = "_blank";
        dwAnchor.rel = "noreferrer noopener nofollow";
        dwAnchor.textContent = "Download";
        return dwAnchor
    }

    static createFromData(PublisherName,Identifier,DefaultVersion,DisplayName) {
        // Return a new instance of Handler
        if (Identifier && DefaultVersion) {
            return new Handler(PublisherName,Identifier,DefaultVersion,DisplayName);
        } else if (Identifier) {
            console.error("Extension Default Version not found.");
        } else if (DefaultVersion) {
            console.error("Extension Identifier not found.");
        }
        return null;
    }

    static createFromVSSExtJSON(jsonData) {
        // Parse the JSON content
        let Data = JSON.parse(jsonData);

        // Extract necessary information
        let PublisherName = Data.publisher.publisherName;
        let DisplayName = Data.publisher.displayName;
        let Identifier = Data.extensionName;
        let DefaultVersion = Data.versions[0].version;

        return Handler.createFromData(PublisherName,Identifier,DefaultVersion,DisplayName)
    }
    static createFromjiContentJSON(jsonData) {
        // Parse the JSON content
        let Data = JSON.parse(jsonData);

        // Extract necessary information
        let PublisherName = Data.Resources.PublisherName;
        let DisplayName = Data.MoreInfo.PublisherValue;
        let Identifier = Data.Resources.ExtensionName;
        let DefaultVersion = Data.Resources.Version;

        return Handler.createFromData(PublisherName,Identifier,DefaultVersion,DisplayName)
    }
    static createFromTable(Table) {
        let PublisherName, Identifier, DefaultVersion, DisplayName;
        for (let n = 0; n < Table.length; n++) {
            let i = Table[n];
            let a = i.querySelectorAll("td");
            if (a.length === 2) {
                let o = a[0].innerText.replace(/^\s+|\s+$/g, "");
                let l = a[1].innerText.replace(/^\s+|\s+$/g, "");
                console.log("EPIC!",o,l)
                if (o === "Publisher") {
                    DisplayName = l;
                } else if (o === "Unique Identifier") {
                    PublisherName = l.split(".")[0];
                    Identifier = l.split(".")[1];
                } else if (o === "Version") {
                    DefaultVersion = l;
                }
            }
        }
        return Handler.createFromData(PublisherName,Identifier,DefaultVersion,DisplayName)
    }
}

class DocumentModifier {
    constructor(Handler) {
        this.Handler = Handler
    }
    AddOverviewDownloadLink(ul,Version = this.Handler.default_version) {
        let newListItem = document.createElement("li");
        newListItem.appendChild(this.Handler.getDownloadAnchor(Version));
        ul.appendChild(newListItem);
    }
    AddHeadDownloadColumn(headerRow) {
        // Add the "Download" column header
        let downloadTh = document.createElement("th");
        downloadTh.className = "version-history-container-column";
        downloadTh.textContent = "Download";

        // Remove the first empty <th> element
        let firstEmptyTh = headerRow.querySelector("th.version-history-container-column:empty");
        if (firstEmptyTh) {
            headerRow.removeChild(firstEmptyTh);
        }

        headerRow.appendChild(downloadTh);
    }
    AddDownloadColumn(row) {
        let downloadTd = document.createElement("td");
        downloadTd.className = "version-history-container-column";

        // Remove the first empty <td> element
        let firstEmptyTd = row.querySelector("td.version-history-container-column:empty");
        if (firstEmptyTd) {
            row.removeChild(firstEmptyTd);
        }

        let Version = row.querySelector(".version-history-container-column").textContent.trim();
        if (!Version) {
            return false;
        }

        let downloadLink = document.createElement("a");
        downloadLink.href = this.Handler.getDownloadUrl(Version);
        downloadLink.textContent = "Download";

        downloadTd.appendChild(downloadLink);
        row.appendChild(downloadTd);
        return true;
    }
    AddDownloadColumns() {
        let retval = true;
        let tbodyRows = document.querySelectorAll(".version-history-table-body .version-history-container-row");
        tbodyRows.forEach((row) => {
            if (!this.AddDownloadColumn(row)) {
                console.err("Couldn't extract row version");
                retval = false;
            }
        });
        return retval;
    }
    static GenHandler() {
        let VssExtTag = document.querySelector('script.vss-extension[type="application/json"]');
        if (VssExtTag) {
            console.log("ScriptTag \"vss-extension\" found");
            return Handler.createFromVSSExtJSON(VssExtTag.textContent);
        }

        let jiContentTag = document.querySelector('script.jiContent[type="application/json"]');
        if (jiContentTag) {
            console.log("ScriptTag \"jiContent\" found");
            return Handler.createFromjiContentJSON(jiContentTag.textContent);
        }

        let tableRows = document.querySelectorAll(".ux-table-metadata tr");
        if (tableRows) {
            console.log("Metadata Table found");
            return Handler.createFromTable(tableRows);
        }
        return null;
    }
    static createFromDocument() {
        let h = DocumentModifier.GenHandler();
        if (h) {
            return new DocumentModifier(h);
        }
        console.log("Couldn't extract necessary data");
        return h
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function AddElements(Dm,WindowUrl) {
    let Resources, headerRow;
    let c1 = !WindowUrl.includes("#") || WindowUrl.endsWith("#overview")
    let c2 = WindowUrl.endsWith("#version-history") || !(WindowUrl.includes("#") || SsrRegex.test(WindowUrl))
    if (c1) {
        Resources = document.querySelector(".ux-section-resources ul")
        if (!Resources) {
            return false;
        }
    }
    if (c2) {
        headerRow = document.querySelector(".version-history-table-thead .version-history-container-row");
        if (!headerRow) {
            return false;
        }
    }
    if (c1) {
        Dm.AddOverviewDownloadLink(Resources)
    }

    if (c2) {
        Dm.AddHeadDownloadColumn(headerRow)
        Dm.AddDownloadColumns()
    }
    console.log("Added download links")
    return true;
}

(async () => {
    let PrevWindowUrl;
    let PrevWindowBaseUrl;
    let Dm;

    do {
        let WindowUrl = window.location.href;
        let WindowBaseUrl = WindowUrl.split("#")[0];
        if (WindowBaseUrl != PrevWindowBaseUrl) {
            Dm = DocumentModifier.createFromDocument()
            PrevWindowBaseUrl = WindowBaseUrl
        }

        if (Dm && WindowUrl !== PrevWindowUrl && document.readyState == "complete" && AddElements(Dm,WindowUrl)) {
            PrevWindowUrl = WindowUrl
        }
        await sleep(Timeout);
    } while (window.location.hostname.endsWith(UrlPattern));
})();
