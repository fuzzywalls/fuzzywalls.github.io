---
layout: empty
title:  "Mips Online Assembler"
date:   2020-07-30 00:00:00 -0400
comments: false
categories: 
---
{::nomarkdown}
<html>
	<link rel="stylesheet" type="text/css" href="{{site.baseurl}}/assets/css/assembler.css">
    <script src="{{site.baseurl}}/assets/js/assembler/process.js"></script>
	<script src="{{site.baseurl}}/assets/js/assembler/MipsBase.js"></script>
	<body>
        <div>
			<img src="{{site.baseurl}}/assets/images/TNS.png" width="80" height="80" style="float: right;">
            <h2>
				Tactical Network Solutions Online Assembler
			</h2>
			<div style="margin-bottom: 10px;">
				<select id="arch" class="round">
					<option value="" selected>Select Architecture</option>
					<option value="1">MIPS I</option>
					<option value="2">MIPS II</option>
					<option value="3">MIPS III</option>
					<option value="4">MIPS IV</option>
				</select>
				<select id="endian" class="round">
					<option value="little">Little Endian</option>
					<option value="bit">Big Endian</option>
				</select>
			</div>
		</div>
		<div class="text-content">
			<div id="line-numbers"></div>
			<div id="bytes"></div>
			<div contenteditable="false" spellcheck="false" id="assembly"><div><span>Select architecture above to get started.</span></div></div>
            <div id="byte-data">
                <h2 id=bb-collapse class="collapsible">Bad Bytes </h2>
				<div id="bad-bytes"></div>
				<h2 id=bs-collapse class="collapsible">Byte String <div class="tooltip"><img id="copy-bytes" src="{{site.baseurl}}/assets/images/copy-icon.png" onmouseout="clearTooltip()"></img><span id="tooltip" class="tooltiptext">Copy bytes to clipboard</span></div> </h2>
				<div id="byte-string"></div>
				<h2 id=err-collapse class="collapsible">Errors <div id="error-count">0</div></h2>
				<div id="errors"></div>
			</div>
		</div>
	</body>
</html>

<script>

	var assemblyText = document.getElementById("assembly");
	var errorMessages = document.getElementById("errors");
	var errorCount = document.getElementById("error-count");
	var endian = document.getElementById("endian");
	var arch = document.getElementById("arch");
	var badBytes = document.getElementById("bad-bytes");
	var copyBytes = document.getElementById("copy-bytes");
	var bbCollapsible = document.getElementById("bb-collapse");
	var bsCollapsible = document.getElementById("bs-collapse");
	var errCollapsible = document.getElementById("err-collapse");

	assemblyText.value = "";
	arch.value = "";
	addLineNumber(true);

	assemblyText.addEventListener("keydown", processKeyDown);
	assemblyText.addEventListener("input", processDelete);
	endian.addEventListener("change", updateBytes);
	arch.addEventListener("change", loadArchitecture);
	bbCollapsible.addEventListener("click", handleCollapse);
	bsCollapsible.addEventListener("click", handleCollapse);
	errCollapsible.addEventListener("click", handleCollapse);
	//copyBytes.addEventListener("click", copyBytes);

	for(var i=0; i<=0xFF; i++) {
		var newButton = document.createElement('input');
		newButton.type = "button";
		var value = i.toString(16);
		if(value.length < 2) {
			value = '0' + value;
		}
		newButton.value = "0x" + value;
		newButton.addEventListener("mousedown", updateBadBytes);
		newButton.addEventListener("mouseenter", hoverUpdateBadBytes);
		badBytes.appendChild(newButton);
	}


</script>

{:/nomarkdown}