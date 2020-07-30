var keyStrokes = [];
var processingKeyStrokes = false;
var userBadBytes = [];

function shouldProcess(key) {
    /**
    Should key be processed?
    @ret: True if key should be processed, false otherwise.
    */
    return (key > 47 && key < 58)         || // numbers
            key == 32 || key == 13        || // space & return
            key == 8                      || // backspace
            (key > 64 && key < 91)        || // letters
            (key > 95 && key < 112)       || // numpad
            (key > 185 && key < 193)      || // ;=,-./`
            (key > 218 && key < 223);        // [\]
}

function combineSpans(selection) {
    /**
     Combine spans that "touch" based on space as a separator.

     @param selection: Array of selected element and cursor offset.
     */
    let target = selection[0];

    // Don't process an empty span. If the target is the entire DIV then
    // the text box is empty and processing it will delete the entire thing.
    if(target.textContent != "" || target == assemblyText) {
        return;
    }

    let previous = target.previousSibling;
    let next = target.nextSibling;

    if(!previous || !next) {
        return;
    }

    // Commas should be kept as a separate span.
    if(previous.textContent == ',' || next.textContent == ',') {
        return;
    }

    previous.textContent += next.textContent;
    target.parentNode.removeChild(next);
    target.parentNode.removeChild(target);
}

function processKeyDown(e) {
    /**
     Main keystroke processing loop.
     */
    if(!shouldProcess(e.keyCode)) {
        return;
    }

    if(e.ctrlKey || e.altKey) {
        return;
    }

    // Prevent default processing so we handle all aspects of text input.
    e.preventDefault();
    keyStrokes.push(e);

    // "Mutux" to prevent double processing key strokes.
    if(processingKeyStrokes) {
        return;
    }

    processingKeyStrokes = true;
    while(keyStrokes.length) {
        try {
            let currKeystroke = keyStrokes.shift();
            switch(currKeystroke.key) {
                case "Backspace":
                    document.execCommand('delete', false, null);
                    break
                case "Enter":
                    let selection = findPosition();
                    fixSpan(selection, " ", true);
                    document.execCommand('insertParagraph', false, null);
                    break;
                default:
                    document.execCommand('insertText', false, currKeystroke.key);
            }
            processKeyPressed(e);
        }
        catch (err) {
            console.log(err);
        }
    }

    processingKeyStrokes = false;
}

function processKeyPressed(e) {
    /**
     Process special cases for keys, perform syntax highlighting, update bytes
     column.
     */
    let selection = findPosition();
    switch (e.keyCode) {
        case 32: // Space
            fixSpan(selection, " ");
            break;
        case 57:
        case 48:
            if(!e.shiftKey) {
                break;
            }
        case 188: // Comma
            fixSpan(selection, e.key);
            break;
        case 13: // Enter
            selection[0].className = '';
            addLineNumber();
            break;
        case 8: // Backspace
            combineSpans(selection);
        case 46: // Delete
            removeLineNumber();
            break;

    }

    syntaxHighlight(assemblyText);
    updateBytes();
}

function findPosition() {
    /**
     Find position of the cursor.

     @ret: Array -> [selected element, cursor offset]
     */
    let sel = window.getSelection();
    let node = sel.anchorNode.parentNode;
    // DIV as the parent means the cursor is likely in a text element, it should
    // be returned instead.
    if(node.tagName == "DIV") {
        node = sel.anchorNode;
    }
    let offset = sel.focusOffset;
    return [node, offset];
}

function fixSpan(selection, fixChar, maintainCursor=false) {
    /**
     Fix spans. Typically called after space key is pressed.
     */
    let text = selection[0].textContent.split(fixChar);

    // If only one element is found check if its a text node and make it a span.
    if(text.length == 1) {
        if(selection[0].nodeType == 3) {
            let newSpan = document.createElement('span');
            newSpan.textContent = text[0];
            selection[0].replaceWith(newSpan);
            setCursor(newSpan, 1);
        }
        return;
    }

    if(text.length > 2) {
        return;
    }

    // If two spaces are encountered.
    if(text[0] == "" && text[1] == "") {
        setCursor(selection[0], selection[1])
        return;
    }


    // Process first or second element character matching the fix up char.
    // If match is found just add it to the other span.
    if(text[0] == "" && selection[0].previousSibling &&
            selection[0].previousSibling.textContent.endsWith(fixChar)) {
        selection[0].previousSibling.textContent += fixChar;
        selection[0].textContent = selection[0].textContent.slice(1);
        return;
    }
    else if(text[1] == "" && selection[0].nextSibling &&
            selection[0].nextSibling.textContent.startsWith(fixChar)) {
        selection[0].nextSibling.textContent = fixChar + selection[0].nextSibling.textContent;
        selection[0].textContent = selection[0].textContent.slice(0, selection[0].textContent.length-1);
        return;
    }

    // Create two new spans and populate them with text.
    let spanOne = document.createElement('span');
    let spanTwo = document.createElement('span');
    let spacer = null;
    let cursor = null;
    let cursorPos = 0;

    if(text[0] == "" || text[0] == " ") {
        spanOne.innerHTML = fixChar;
        spanTwo.textContent = selection[0].textContent.replace(fixChar, "");
        cursor = spanTwo;
        if(maintainCursor) {
            cursorPos = 1; // set cursor at end.
        }
    }
    else if(text[1] == "" || text[1] == " ") {
        spanOne.textContent = selection[0].textContent.replace(fixChar, "");
        spanTwo.innerHTML = fixChar;
    }
    else {
        spanOne.textContent = text[0];
        spanTwo.textContent = text[1];
        spacer = document.createElement('span');
        spacer.innerHTML = "&nbsp";
        cursor = spanTwo;
    }

    selection[0].parentNode.insertBefore(spanOne, selection[0]);
    if(spacer) {
        selection[0].parentNode.insertBefore(spacer, selection[0]);
    }
    selection[0].parentNode.insertBefore(spanTwo, selection[0]);
    selection[0].parentNode.removeChild(selection[0]);

    if (cursor) {
        setCursor(cursor, cursorPos);
    }
}

function setCursor(target, position) {
    /**
     Set cursor position in the element.
     */
    let range = document.createRange();
    let sel = document.getSelection();
    range.setStart(target, position);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

function addLineNumber(force=false) {
    /**
     Add line number to line number column.
     */
    let line_numbers = document.getElementById("line-numbers");
    if(assemblyText.children.length == 0) {
        force=true;
    }
    while(line_numbers.children.length < assemblyText.children.length || force) {
        let line_number = document.createElement("span");
        line_number.className = "line-number";
        line_numbers.appendChild(line_number);
        force = false;
    }
}

function removeLineNumber() {
    /**
     Remove line number from line number column.
     */
    let line_numbers = document.getElementById("line-numbers");
    while(assemblyText.children.length < line_numbers.children.length) {
        // Leave line number 1.
        if(line_numbers.children.length == 1) {
            return;
        }
        line_numbers.removeChild(line_numbers.childNodes[line_numbers.childElementCount-1])
    }
}

function processDelete(e) {
    // Handle edge cases that dont go through the key press loop.
    if(e.inputType === "deleteContentBackward" ||
            e.inputType === "deleteContentForward") {
        updateBytes();
    }
}

function updateBytes() {
    /**
     Updated disassembly bytes.
     */
    let bytesText = document.getElementById("bytes");
    let endian = document.getElementById("endian").value;
    let byteString = document.getElementById("byte-string");

    byteString.textContent = "";

    clearSpan(bytesText);
    clearSpan(errorMessages);
    errorCount.className = "";

    assemblyText.childNodes.forEach(assembly => {
        convert_instruction(assembly, bytesText, endian);
    });
}

function copyBytesToClipboard() {
   let byte_string = document.getElementById('byte-string')
   let tt = document.getElementById('tooltip');
   navigator.clipboard.writeText(byte_string.textContent).then(
        function() {
            tooltip.textContent = 'Copied ' + byte_string.textContent.length / 4 + ' bytes.';
        },
        function(err) {

        }
   );
}

function clearTooltip(e) {
   let tt = document.getElementById('tooltip');
   tooltip.textContent = 'Copy bytes to clipboard';
}

function convert_instruction(assembly, bytesText, endian) {
    /**
     Convert instructions to bytes.
     */
    var assembly_bytes = [' '];
    if(assembly.textContent != "") {
        assembly_bytes = [];
        try {
            let parser = getParser();
            if(parser === undefined) {
                return;
            }
            let inst = new parser(assembly);
            let bytes = inst.bytes;
            for(var i=0; i<bytes.length; i++) {
                if(endian=== "little") {
                    assembly_bytes = assembly_bytes.concat(bytes[i].reverse());
                }
                else {
                    assembly_bytes = assembly_bytes.concat(bytes[i]);
                }
                assembly.className = '';
            }
            addToByteString(assembly_bytes);
        }
        catch (err) {
            errorCount.className = "errors-present";
            addErrorMessage(assembly, err.message);
            assembly.className = "invalid-instruction";
        }
    }
    else {
        assembly.className = '';
    }

    let bytes = document.createElement("div");
    bytes.className = "byte-line";
    let space = document.createElement("span");
    space.textContent = ' ';
    bytes.appendChild(space);

    for(var i=0; i<assembly_bytes.length; i++) {
        let byte = document.createElement("span");
        byte.textContent = assembly_bytes[i];
        if(userBadBytes.indexOf(assembly_bytes[i]) != -1) {
            byte.className = "bad-byte";
        }
        bytes.appendChild(byte);
        let space = document.createElement("span");
        space.textContent = ' ';
        bytes.appendChild(space);
    }
    bytesText.appendChild(bytes);
}

function addErrorMessage(assembly, errorMessage) {
    var newSpan = document.createElement('div');
    var lineNumber = Array.prototype.indexOf.call(assembly.parentElement.children, assembly) + 1;
    newSpan.textContent = 'Line ' + lineNumber + ': ' + errorMessage;
    errorMessages.appendChild(newSpan);
    errorCount.textContent = errorMessages.childElementCount;
}

function addToByteString(bytes) {
    /**
     Add disassembly bytes to byte string.
     */
    let byteString = document.getElementById("byte-string");
    for(let i=0; i<bytes.length; i++) {
        byteString.textContent += "\\x" + bytes[i].toString(16);
    }
}


function loadArchitecture(e) {
    /**
     Dynamically load javascript file for the chosen architecture.
     */
    let version = e.target.value;
    let assemblyText = document.getElementById("assembly");

    if(version == "") {
        assemblyText.textContent = "Select architecture above to get started.";
        assemblyText.contentEditable = false;
        return;
    }

    mipsInstructions = new MipsInstructions(version);
    assemblyText.innerHTML = loadMessage();
    fixupPlainText();
    syntaxHighlight(assemblyText);
    assemblyText.contentEditable = true;
}


function clearSpan(span) {
    /**
     Remove all children from a span.
     */
    if(span == null) {
        return;
    }
    while(span.firstChild) {
        span.removeChild(span.firstChild);
    }
}

function hoverUpdateBadBytes(e) {
    if(e.buttons == 0) {
        return;
    }
    updateBadBytes(e);
}

function updateBadBytes(e) {

    /**
     Callback for clicking on a "bad" byte button.
     */
    let arr = e.target.className.split(" ");
    if(arr.indexOf("down") == -1) {
        e.target.className += " down";
    }
    else {
        e.target.className = " ";
    }

    let value = e.target.value.slice(2);
    let index = userBadBytes.indexOf(value);
    if(index != -1) {
        userBadBytes.splice(index, 1);
    }
    else {
        userBadBytes.push(value);
    }

    updateBytes();
}

function handleCollapse(e) {
    /**
     Handle collapse of panel.
     */
     // Prevent collapse firing on elements inside the collapsible div.
     // Basically just the error count bubble.
    if(!e.target.id.endsWith('collapse')) {
        if(e.target.id == "copy-bytes") {
            copyBytesToClipboard();
            return;
        }
        e.target.parentElement.classList.toggle("active");
    }
    else {
        e.target.classList.toggle("active");
    }
    let content = e.target.nextElementSibling;
    if(content.style.maxHeight) {
        content.style.maxHeight = null;
        content.style.overflow = 'hidden';
    }
    else {
        content.style.maxHeight = content.scrollHeight + "px";
        content.style.overflow = 'initial';
    }
}

function fixupPlainText() {
    /**
     Convert plain text to span elements.
     */
    let splitText = assemblyText.innerText.split('\n');
    assemblyText.innerText = '';
    splitText.forEach(instruction => {
        let newDiv = document.createElement('div');
        if(instruction != '' && instruction != ' ') {
            instruction.split(' ').forEach(insElement => {
                let newSpan = document.createElement('span');
                let newSpace = document.createElement('span');
                let comma = null;
                if(insElement.endsWith(',')) {
                    insElement = insElement.slice(0, insElement.length-1);
                    comma = document.createElement('span');
                    comma.textContent = ',';
                }

                newSpan.textContent = insElement;
                newSpace.textContent = ' ';
                newDiv.appendChild(newSpan);
                if(comma) {
                    newDiv.appendChild(comma);
                }
                newDiv.appendChild(newSpace);
            });
        }
        else {
            let lineBreak = document.createElement('br');
            newDiv.appendChild(lineBreak);
        }
        assemblyText.appendChild(newDiv);
        addLineNumber();
    });
    updateBytes();
}
