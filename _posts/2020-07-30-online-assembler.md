---
layout: empty
title:  "Mips Online Assembler"
date: 2020-07-30 00:00:00 -0400
comments: false
categories: 
---
{::nomarkdown}
<html>
	<link rel="stylesheet" type="text/css" href="{{site.baseurl}}/assets/css/assembler.css">
    <script src="{{site.baseurl}}/assets/js/assembler/editor.js"></script>
    <script src="{{site.baseurl}}/assets/js/assembler/processor.js"></script>
	<script src="{{site.baseurl}}/assets/js/assembler/MipsBase.js"></script>
	<body>
        <div>
			<img src="{{site.baseurl}}/assets/images/TNS.png" width="80" height="80" style="float: right;">
            <h2>
                Tactical Network Solutions Online Assembler
            </h2>
            <div style="margin-bottom: 10px; display: inline-flex;">
                <div class="select">
                    <select id="arch">
                        <option value="" selected>Select Architecture</option>
                        <option value="1">MIPS I</option>
                        <option value="2">MIPS II</option>
                        <option value="3">MIPS III</option>
                        <option value="4">MIPS IV</option>
                    </select>
                </div>
                <div class="select">
                    <select id="endian">
                        <option value="little">Little Endian</option>
                        <option value="bit">Big Endian</option>
                    </select>
                </div>
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
				<div id="byte-string">No bytes found. Write some assembly first.</div>
				<h2 id=err-collapse class="collapsible">Errors <div id="error-count">0</div></h2>
				<div id="errors">No errors detected.</div>
			</div>
		</div>
	</body>
    <footer>Last Update: August 5, 2020</footer>
</html>
{:/nomarkdown}