const registers = {zero: 0, at: 1, v0: 2, v1: 3, a0: 4, a1: 5, a2: 6, a3: 7,
                   t0: 8, t1: 9, t2: 10, t3: 11, t4: 12, t5: 13, t6: 14,
                   t7: 15, s0: 16, s1: 17, s2: 18, s3: 19, s4: 20, s5: 21,
                   s6: 22, s7: 23, t8: 24, t9: 25, k0: 26, k1: 27, gp: 28,
                   sp: 29, fp: 30, ra: 31 };



function defaultSplit(parameters, compoundAssign=true) {
    var instRegisters = parameters.split(",");
    if(compoundAssign && instRegisters.length === 2) {
        instRegisters = Array(instRegisters[0], instRegisters[0], instRegisters[1])
    }

    for(var i=0; i<instRegisters.length; i++) {
        instRegisters[i] = instRegisters[i].trim().replace('$', '');
    }
    return instRegisters;
}

function directiveSplit(parameters) {
    var dirValues = parameters.split(",");

    for(var i=0; i<dirValues.length; i++) {
        dirValues[i] = dirValues[i].trim().replace('$', '');
    }
    return dirValues;
}

function loadSaveSplit(parameters) {
    var params = parameters.split(",");
    var offsetReg = params[1].split("(");

    var instRegisters = [params[0], offsetReg[1].replace(")", ""), offsetReg[0]];

    for(var i=0; i<instRegisters.length; i++) {
        instRegisters[i] = instRegisters[i].trim().replace('$', '');
    }
    return instRegisters;
}

function processInput(parameters, registerCount=0, immediateCount=0, maxImmediateValue=0, immediateRequired=true) {
    var values = Array(registerCount + immediateCount);
    for(var i=0; i<registerCount; i++) {
        var currReg = parameters[i];
        if(currReg in registers) {
            values[i] = registers[currReg];
        }
        else {
            throw new Error("Invalid register found.")
        }
    }

    if(immediateCount > 0) {
        var index = parameters.length - 1;

        if(parameters[index] === "") {
            if(immediateRequired) {
                throw new Error('Missing immediate value.');
            }
            return values;
        }
        else if(isNaN(parseInt(parameters[index]))) {
            if(immediateRequired) {
                throw new Error('Missing or invalid immediate value.');
            }
            return values;
        }

        if(parameters[index] > maxImmediateValue) {
            throw new Error('Immediate value cannot be larger than 0x' +
                                maxImmediateValue.toString(16) + '(' +
                                maxImmediateValue + ')');
        }
        values[index] = parameters[index];
    }

    return values;
}

function threeRegisters(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params, 3)
}

function twoRegisters(parameters) {
    var params = defaultSplit(parameters, compoundAssign=false);
    return processInput(params, 2);
}

function moveProcess(parameters) {
    var params = defaultSplit(parameters, compoundAssign=false);
    params.push("zero");
    return processInput(params, 3);
}

function liProcess(parameters) {
    var params = defaultSplit(parameters, compoundAssign=false);
    params = [params[0], 'zero', params[1]];
    return processInput(params, 2, 1, 0xFFFF);
}

function twoRegisterAndImmediate(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params, 2, 1, 0xFFFF);
}

function twoRegisterAndImmSmall(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params, 2, 1, 0x1F);
}

function oneRegisterAndImmediate(parameters) {
    var params = defaultSplit(parameters, false);
    return processInput(params, 1, 1, 0xFFFF);
}

function oneRegister(parameters) {
    var params = defaultSplit(parameters, false);
    return processInput(params, 1);
}

function syscallProcess(parameters) {
    var params = defaultSplit(parameters, false)
    return processInput(params, 0, 1, 0xFFFFF, false);
}

function largeImmediate(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params, 0, 1, 0x3FFFFFF)
}

function loadSave(parameters) {
    var params = loadSaveSplit(parameters);
    return processInput(params, 2, 1, 0xFFFF)
}

function loadSaveSmallImm(parameters) {
    var params = loadSaveSplit(parameters);
    return processInput(params, 2, 1, 0x1F)
}

function secondParamOn(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params.slice(1), 2);
}

function firstParam(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params.slice(0, 1), 1);
}

function trapProcess(parameters) {
    var params = defaultSplit(parameters);
    return processInput(params, 2, 1, 0x3FF);
}

function syncProcess(parameters) {
    var params = defaultSplit(parameters, false)
    return processInput(params, 0, 1, 0x1F, false);
}

function shiftProcess(parameters) {
    var params = defaultSplit(parameters, false)
    return processInput(params, 2, 1, 0x1F, false);
}

function byteProcessor(parameters, byteCount, maxValue) {
    var dirValues = directiveSplit(parameters);
    var bytes = [];
    for(var i=0; i<dirValues.length; i++) {
        var processed=0;
        var value = dirValues[i];
        if(value === "") {
            continue;
        }

        if(isNaN(parseInt(value))) {
            throw new Error("Value must be an integer value.");
        }
        else if(value > maxValue) {
            throw new Error("Value cannot be larger than 0xFFFFFFFF (4294967295)");
        }

        var byte_string = [];
        for(var j=0; j<byteCount; j++) {
            var curr_byte = (value & 0xFF).toString(16);
            if(curr_byte.length < 2) {
                curr_byte = '0' + curr_byte;
            }
            value = value >> 8;
            byte_string.unshift(curr_byte);
        }
        bytes.push(byte_string);
    }
    return bytes;
}

function wordProcess(parameters) {
    return byteProcessor(parameters, 4, 0xFFFFFFFF);
}

function halfProcess(parameters) {
    return byteProcessor(parameters, 2, 0xFFFF);
}

function byteProcess(parameters) {
    return byteProcessor(parameters, 1, 0xFF);
}

function emptyProcess(parameters) {
    return [[]];
}

function asciiProcess(parameters) {
    var paramArray = parameters.split("");
    var hexBytes = [];
    for(var i=0; i<paramArray.length; i++) {
        hexBytes.push(paramArray[i].charCodeAt(0).toString(16));
    }
    return [hexBytes];
}

function asciizProcess(parameters) {
    var hexBytes = asciiProcess(parameters);
    hexBytes.push("00");
    return [hexBytes];
}

class MipsInstruction {
    constructor(name, processorFn=null, instBytes=null, shifts=null,
                pseudoExpansion=null) {
        this.name = name;
        this.processorFn = processorFn;
        this.instBytes = instBytes;
        this.shifts = shifts
        this.pseudoExpansion = pseudoExpansion
    }
}

class MipsDirective {
    constructor(name, processorFn) {
        this.name = name;
        this.processorFn = processorFn;
    }
}

class MipsInstructions {
    constructor(version) {
        this.instructions = {};
        this.directives = {};

        switch(version) {
        case "4":
            this.add_ins('movn', threeRegisters, 0xB, [11, 21, 16]);
            this.add_ins('movz', threeRegisters, 0xA, [11, 21, 16]);
            this.add_ins('pref', loadSave, 0xCC000000, [16, 21, 0]);
            this.add_ins('prefx', loadSaveSmallImm, 0x4c00000F, [11, 21, 16]);
        case "3":
            this.add_ins('dadd', threeRegisters, 0x2C, [11, 21, 16]);
            this.add_ins('daddu', threeRegisters, 0x2D, [11, 21, 16]);
            this.add_ins('daddi', twoRegisterAndImmediate, 0x60000000, [16, 21, 0]);
            this.add_ins('daddiu', twoRegisterAndImmediate, 0x64000000, [16, 21, 0]);
            this.add_ins('ddiv', twoRegisters, 0x1E, [21, 16]);
            this.add_ins('ddivu', twoRegisters, 0x1F, [21, 16]);
            this.add_ins('dmult', twoRegisters, 0x1C, [21, 16]);
            this.add_ins('dmultu', twoRegisters, 0x1D, [21, 16]);
            this.add_ins('dsll', shiftProcess, 0x38, [11, 16, 6]);
            this.add_ins('dsll32', shiftProcess, 0x3C, [11, 16, 6]);
            this.add_ins('dsllv', threeRegisters, 0x14, [11, 16, 21]);
            this.add_ins('dsra', shiftProcess, 0x3B, [11, 16, 6]);
            this.add_ins('dsra32', shiftProcess, 0x3F, [11, 16, 6]);
            this.add_ins('dsrav', threeRegisters, 0x17, [11, 16, 21]);
            this.add_ins('dsrl', shiftProcess, 0x3A, [11, 16, 6]);
            this.add_ins('dsrl32', shiftProcess, 0x3E, [11, 16, 6]);
            this.add_ins('dsrlv', threeRegisters, 0x16, [11, 16, 21]);
            this.add_ins('dsub', threeRegisters, 0x2E, [11, 21, 16]);
            this.add_ins('dsubu', threeRegisters, 0x2F, [11, 21, 16]);
            this.add_ins('ld', loadSave, 0xBC000000, [16, 21, 0]);
            this.add_ins('ldl', loadSave, 0x68000000, [16, 21, 0]);
            this.add_ins('ldr', loadSave, 0x6C000000, [16, 21, 0]);
            this.add_ins('lld', loadSave, 0xD0000000, [16, 21, 0]);
            this.add_ins('lwu', loadSave, 0x9C000000, [16, 21, 0]);
            this.add_ins('scd', loadSave, 0xF0000000, [16, 21, 0]);
            this.add_ins('sd', loadSave, 0xFC000000, [16, 21, 0]);
            this.add_ins('sdl', loadSave, 0xB0000000, [16, 21, 0]);
            this.add_ins('sdr', loadSave, 0xB4000000, [16, 21, 0]);
        case "2":
            this.add_ins('beql', twoRegisterAndImmediate, 0x50000000, [21, 16, 0]);
            this.add_ins('bgezl', oneRegisterAndImmediate, 0x04030000, [21, 0]);
            this.add_ins('bgezall', oneRegisterAndImmediate, 0x04130000, [21, 0]);
            this.add_ins('bgtzl', oneRegisterAndImmediate, 0x5C000000, [21, 0]);
            this.add_ins('blezl', oneRegisterAndImmediate, 0x58000000, [21, 0]);
            this.add_ins('bltzall', oneRegisterAndImmediate, 0x04120000, [21, 0]);
            this.add_ins('bltzl', oneRegisterAndImmediate, 0x04020000, [21, 0]);
            this.add_ins('bnel', twoRegisterAndImmediate, 0x54000000, [21, 16, 0]);
            this.add_ins('ll', loadSave, 0xC0000000, [16, 21, 0]);
            this.add_ins('sc', loadSave, 0xE0000000, [16, 21, 0]);
            this.add_ins('teq', trapProcess, 0x34, [21, 16, 6]);
            this.add_ins('teqi', oneRegisterAndImmediate, 0x040C0000, [21, 0]);
            this.add_ins('tge', trapProcess, 0x30, [21, 16, 6]);
            this.add_ins('tgei', oneRegisterAndImmediate, 0x04080000, [21, 0]);
            this.add_ins('tgeiu', oneRegisterAndImmediate, 0x04090000, [21, 0]);
            this.add_ins('tgeu', trapProcess, 0x31, [21, 16, 6]);
            this.add_ins('tlti', oneRegisterAndImmediate, 0x040A0000, [21, 0]);
            this.add_ins('tltiu', oneRegisterAndImmediate, 0x040B0000, [21, 0]);
            this.add_ins('tne', trapProcess, 0x36, [21, 16, 6]);
            this.add_ins('tnei', oneRegisterAndImmediate, 0x040E0000, [21, 0]);
            this.add_ins('tlt', trapProcess, 0x32, [21, 16, 6]);
            this.add_ins('tltu', trapProcess, 0x33, [21, 16, 6]);
            this.add_ins('sync', syncProcess, 0xF, [6]);
        case "1":
            this.add_ins('add', threeRegisters, 0x20, [11, 21, 16]);
            this.add_ins('addi', twoRegisterAndImmediate, 0x20000000, [16, 21, 0]);
            this.add_ins('addiu', twoRegisterAndImmediate, 0x24000000, [16, 21, 0]);
            this.add_ins('addu', threeRegisters, 0x21, [11, 21, 16], null);
            this.add_ins('and', threeRegisters, 0x24, [11, 21, 16], null);
            this.add_ins('andi', twoRegisterAndImmediate, [16, 21, 0]);
            this.add_ins('beq', twoRegisterAndImmediate, 0x10000000, [21, 16, 0]);
            this.add_ins('bgez', oneRegisterAndImmediate, 0x4010000, [21, 0]);
            this.add_ins('bgezal', oneRegisterAndImmediate, 0x04110000, [21, 0]);
            this.add_ins('bgtz', oneRegisterAndImmediate, 0x1c000000, [21, 0]);
            this.add_ins('blez', oneRegisterAndImmediate, 0x18000000, [21, 0]);
            this.add_ins('bltz', oneRegisterAndImmediate, 0x04000000, [21, 0]);
            this.add_ins('bltzal', oneRegisterAndImmediate, 0x04100000, [21, 0]);
            this.add_ins('break', syscallProcess, 0xD, [6]);
            this.add_ins('bne', twoRegisterAndImmediate, 0x14000000, [21, 16, 0]);
            this.add_ins('div', twoRegisters, 0x1a, [21, 16]);
            this.add_ins('divu', twoRegisters, 0x1b, [21, 16]);
            this.add_ins('j', largeImmediate, 0x08000000, [0]);
            this.add_ins('jal', largeImmediate, 0x0c000000, [0]);
            this.add_ins('jr', oneRegister, 0x08, [21]);
            this.add_ins('lb', loadSave, 0x80000000, [16, 21, 0]);
            this.add_ins('lbu', loadSave, 0x90000000, [16, 21, 0]);
            this.add_ins('lh', loadSave, 0x84000000, [16, 21, 0]);
            this.add_ins('lhu', loadSave, 0x94000000, [16, 21, 0]);
            this.add_ins('li', liProcess, 0x38000000, [16, 21, 0]);
            this.add_ins('lui', oneRegisterAndImmediate, 0x3c000000, [16, 0]);
            this.add_ins('lw', loadSave, 0x8c000000, [16, 21, 0]);
            this.add_ins('lwl', loadSave, 0x88000000, [16, 21, 0]);
            this.add_ins('lwr', loadSave, 0x98000000, [16, 21, 0]);
            this.add_ins('move', [moveProcess], null,  null, ['or']);
            this.add_ins('mfhi', oneRegister, 0x10, [11]);
            this.add_ins('mflo', oneRegister, 0x12, [11]);
            this.add_ins('mthi', oneRegister, 0x11, [21]);
            this.add_ins('mtlo', oneRegister, 0x13, [21]);
            this.add_ins('mul', [secondParamOn, firstParam], null, null, ['multu', 'mflo'])
            this.add_ins('mult', twoRegisters, 0x18, [21, 16]);
            this.add_ins('multu', twoRegisters,  0x19, [21, 16]);
            this.add_ins('nor', threeRegisters,  0x27, [11, 21, 16]);
            this.add_ins('or', threeRegisters, 0x25, [11, 21, 16]);
            this.add_ins('ori', twoRegisterAndImmediate, 0x34000000, [16, 21, 0]);
            this.add_ins('sb', loadSave, 0xa0000000, [16, 21, 0]);
            this.add_ins('sh', loadSave, 0xa4000000, [16, 21, 0]);
            this.add_ins('sll', twoRegisterAndImmSmall, 0x00, [11, 16, 6]);
            this.add_ins('sllv', threeRegisters, 0x04, [11, 16, 21]);
            this.add_ins('slt', threeRegisters, 0x2a, [11, 21, 16]);
            this.add_ins('slti', twoRegisterAndImmediate, 0x28000000, [16, 21, 0]);
            this.add_ins('sltiu', twoRegisterAndImmediate, 0x2c000000, [16, 21, 0]);
            this.add_ins('sltu', threeRegisters, 0x2b, [11, 21, 16]);
            this.add_ins('sra', twoRegisterAndImmSmall, 0x03, [11, 16, 6]);
            this.add_ins('srl', twoRegisterAndImmSmall, 0x02, [11, 16, 6]);
            this.add_ins('srlv', threeRegisters, 0x06, [11, 16, 21]);
            this.add_ins('sub', threeRegisters, 0x22, [11, 21, 16]);
            this.add_ins('subu', threeRegisters, 0x23, [11, 21, 16]);
            this.add_ins('sw', loadSave, 0xAC000000, [16, 21, 0]);
            this.add_ins('swl', loadSave, 0xA8000000, [16, 21, 0]);
            this.add_ins('swr', loadSave, 0xB8000000, [16, 21, 0]);
            this.add_ins('syscall', syscallProcess, 0xc, [6]);
            this.add_ins('xor', threeRegisters, 0x26, [11, 21, 16]);
            this.add_ins('xori', twoRegisterAndImmediate, 0x38000000, [16, 21, 0]);
        }
        this.add_directive('.word', wordProcess);
        this.add_directive('.half', halfProcess);
        this.add_directive('.byte', byteProcess);
        this.add_directive('.ascii', asciiProcess);
        this.add_directive('.asciiz', asciizProcess);
        this.add_directive('.globl', emptyProcess);
        this.add_directive('.text', emptyProcess);
    }

    add_ins(name, processorFn, insBytes=null, shifts=null, pseudoExpansion=null) {
        this.instructions[name] = new MipsInstruction(
            name, processorFn, insBytes, shifts, pseudoExpansion);
    }

    add_directive(name, processorFn) {
        this.directives[name] = new MipsDirective(name, processorFn);
    }

    is_instruction(candidate) {
        if(this.instructions[candidate] == undefined) {
            return false;
        }
        return true;
    }

    is_directive(candidate) {
        if(this.directives[candidate] == undefined) {
            return false;
        }
        return true;
    }

    findInstruction(instruction) {
        var currInstruction = this.instructions[instruction];
        if(currInstruction == undefined) {
            throw new Error('Instruction not found.');
        }

        if(currInstruction.pseudoExpansion !== null) {
            var pseudoExpansion = [];
            for(var j=0; j < currInstruction.pseudoExpansion.length; j++) {
                var expansionFn = this.findInstruction(currInstruction.pseudoExpansion[j]);
                expansionFn[0].processorFn = currInstruction.processorFn[j];
                pseudoExpansion = pseudoExpansion.concat(expansionFn);
            }
            return pseudoExpansion;
        }
        return [currInstruction];
    }

    findDirective(directive) {
        var currDirective = this.directives[directive];
        if(currDirective == undefined) {
            throw new Error("Directive not found.");
        }
        return [currDirective];
    }

    find(target) {
        if(target.startsWith('.')) {
            return this.findDirective(target);
        }
        else {
            return this.findInstruction(target);
        }
    }
}


class MipsParser {
    constructor(target) {
        this.target = target;
        this.target_text = target.textContent;
    }

    get bytes() {
        var target;
        var parameters = "";
        if(this.target_text.indexOf(' ') > 0) {
            target = this.target_text.slice(0, this.target_text.indexOf(' ')).trim();
            parameters = this.target_text.slice(this.target_text.indexOf(' ') + 1)
        }
        else {
            target = this.target_text.trim();
        }

        if(target.startsWith('#') || target.endsWith(':')) {
            return [];
        }

        var mipsMatch = mipsInstructions.find(target);
        var bytes = [];
        for(var i=0; i<mipsMatch.length; i++) {
            var results = this.createBytes(mipsMatch[i], parameters);
            if(mipsMatch[i] instanceof MipsInstruction) {
                bytes.push(results);
            }
            else {
                bytes = results;
            }
        }

        return bytes;
    }

    createInstructionBytes(mipsInstruction, regValues) {
        var byte_string = [];
        var byte_value = mipsInstruction.instBytes;

        for(var i=0; i<regValues.length; i++) {
            var shift = mipsInstruction.shifts[i];
            var curr_byte = regValues[i] << shift;
            byte_value += curr_byte;
        }
        var index = 0;
        while(byte_value > 0 || index < 4){
            var curr_byte = (byte_value & 0xFF).toString(16);
            if(curr_byte.length < 2) {
                curr_byte = '0' + curr_byte;
            }
            byte_value = byte_value >> 8;
            byte_string.unshift(curr_byte);
            index++;
        }

        return byte_string;
    }

    createBytes(target, values) {
        var processedParams = target.processorFn(values);
        if(target instanceof MipsInstruction) {
            return this.createInstructionBytes(target, processedParams);
        }
        else if(target instanceof MipsDirective) {
            return processedParams;
        }
    }
}

function syntaxHighlight(assembly) {
    var allDivs = assembly.querySelectorAll("div");
    allDivs.forEach(currDiv => {
        var spans = currDiv.querySelectorAll("span");
        if(spans.length == 0) {
            return;
        }
        if(spans[0].textContent.startsWith('#')) {
            currDiv.className = 'comment';
        }
        else if(spans[0].textContent.endsWith(':')) {
            currDiv.className = 'label';
        }
        else {
           spans.forEach(span => {
                var text = span.textContent.trim();
                var newClass = '';
                if(mipsInstructions.is_instruction(text)) {
                    newClass = 'instruction';
                }
                else if(mipsInstructions.is_directive(text)) {
                    newClass = 'directive';
                }
                else if(text.replace("$", "") in registers) {
                    newClass = 'register';
                }
                else if(text[0] == " ") {
                    newClass = 'space';
                }
                else if(!isNaN(text)) {
                    newClass = 'number';
                }
                span.className = newClass;
           })
        }
    });
}

function getParser() {
    return MipsParser;
}

function loadMessage() {
    return `.globl main
.text

main:
# Enter instructions here.`;
}