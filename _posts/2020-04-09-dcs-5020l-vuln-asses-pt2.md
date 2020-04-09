---
layout: post
title:  "D-Link DCS-5020L Vuln Assessment Pt. 2"
date:   2020-04-09 16:44:11 -0400
categories: exploits
---

# Exploit Identification

## Turn the Technical Up a Bit
In part one of the Vulnerability assessment we talked about choosing a target,
downloading the firmware, and submitting it to
[Centrifuge](https://www.refirmlabs.com/centrifuge-platform/) which was all pretty
simple. Centrifuge gave us a lot of information about the firmware, most
importantly the potential flaws in the code analysis section. In this
post we are going to talk about the much more technical side of identifying which
of the "flaws" listed are actually flaws, which ones are poor programming
practices, and how to identify which is which.

## Starting the Search
The best place, in my opinion, to begin the search is to identify the administration
server the camera runs on boot. The administration server will be the mostly likely
candidate exposed to the internet, so it's our best choice to start the search.
If you have access to the actual camera you can simply connect a UART cable,
access the shell, and get a process listing to identify the server. But, I
prefer not to buy hardware until I have an actual vulnerability identified and
we actually have all the information we need at out fingertips in the unpacked
firmware. Centrifuge identified a startup script that we can start with,
but if you don't have access to Centrifuge a good place to start is /etc/init.d and
see what services are run at boot.

![Startup Commands]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/startup.png)

At this point I like to use [binwalk](https://github.com/ReFirmLabs/binwalk) to
unpack the firmware locally for easier browsing. Looking through the startup
scripts is a process of reading comments and looking at function calls to identify
what is being run. The start of /etc_ro/rcS is shown below. These files are usually
commented pretty well which is helpful in identifying what is going on.

![/etc_ro/rcS]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/rcS.png)

Working through all the scripts eventually leads to a mention of a webserver,
alpahpd. The path to get there was:

    /etc_ro/rcS -> /sbin/internet.sh -> /sbin/lan.sh -> /sbin/web.sh
So we have our starting point!

## Alphapd
We can either dive right into disassembling alphapd in our tool of choice
(IDA, Ghidra, Radare2, Binary Ninja, etc) or look at the Code Analysis in
Centrifuge and greatly narrow down our choices. Centrifuge will report potential
[buffer overflows](https://en.wikipedia.org/wiki/Buffer_overflow) if the
destination is a stack variable and
[command injections](https://en.wikipedia.org/wiki/Code_injection) if the
parameter is a non-static string. This actually limits the amount of function calls we need
to check from 300+ to 32 which is a pretty substantial time save. The Code Analysis
view gives all the information we need to start looking at the function calls in our
disassembler of choice, for me it's IDA.

![Code Analysis of Alphapd]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/code_analysis.png)

The server is already running by the time our exploit would be processed so we
can skip any calls in main and calls prior to the message processing loop. For buffer
overflows we are looking for two things. The first is, no matter the function call,
that the destination is a stack variable. If this is not true then we won't be able
to overwrite the return address and control execution (more on this later). Second
we need to control some portion or all of the source data. Let's look at an example.

![Non-vulnerable strcpy Centrifuge]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/overflow_centrifuge.png)

![Non-vulnerable strcpy IDA]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/overflow_example.png)

The prototype for strcpy is:

```
strcpy(destination, source);
```
Function arguments in MIPS are $a0, $a1, $a2, $a3 for the first four args then the
stack if more arguments are required. To identify if the destination is on the
stack we need to see what $a0 is set to. MIPS executes instructions based on a [5
stage pipeline](https://en.wikipedia.org/wiki/Classic_RISC_pipeline), because of
this when a call is executed whatever comes after the call (the jalr) is also
executed. This operation is located in what is known as the delay slot. In this
example the delay slot is where the first argument is set and it is simply $a0
= STACK ADDRESS + OFFSET, so the destination is on the stack. Next is whether or
not the source, $a1, is a user controllable string. From the code snippet and a little
digging on what noyes_select is it appears that either the string "No" or "Yes"
will be the source so this is not a user controllable string and will never result in
a buffer overflow. While this is not a buffer overflow it still qualifies as poor
coding practices.

The same process is used to identify valid command injections except this time
there is no destination, but we still need to control the source. Alphapd has a nice
function, doSystem, that combines
[vsnprintf](http://www.cplusplus.com/reference/cstdio/vsnprintf/) and
[system](http://www.cplusplus.com/reference/cstdlib/system/) which means we are
looking for an $a0 with some kind of format string in it. These are pretty quick
to identify potentials versus not. The example below is automatically discounted
because a static string is passed as the argument with no chance of user controlled
data.

![doSystem Centrifuge]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/doSystem_centrifuge.png)

![doSystem IDA]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/doSystem_bad.png)

Now let's look at a buffer overflow that is user controllable:

![strcpy Centrifuge]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/strcpy_centrifuge.png)

![strcpy Centrifuge]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/strcpy_ida.png)

Our destination is on the stack, check. The second parameter is being set by the
$s1 register so we have to travel back up the disassembly a little to see if it's
controllable.

![$s1 Regsiter]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/ida_s1.png)

The $s1 register is set to the contents of the $v0 register which is used for return
values from functions. In this instance the most recent function call is websGetVar,
an alphapd function that retrieves variables from the URL. After staring at the
function for a little bit we end up with some pseudo code that looks like this.

```
sub_443138(request, argument_count, argument_value):
    char wep_encr[4]
    if (2 == argument_count):
        NVRAM_GET(wep_encr, "WEPEncryption")
        if ("WEPEncryption" in $URL)
            strcpy(wep_encr, $URL["WEPEncryption"])
        if (argv[1] == wep_encr):
            return "checked"
        return ""
```
Basically this function checks if supplied arguments are equal to the value of
WEPEncryption from non-volatile random access memory or the URL. If they are
equal it returns the string "checked" or an empty string if they are not equal. If we can cause this
function to be executed with WEPEncryption in the URL the contents of that value
 will be copied directly to the stack. Now the question is who calls this? Lucky
 for us there is only one reference to this function call.

![websParaDefine]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/websParaDefine.png)

Not a lot of information to go on here other than the string "RadioOfWEPEncryWay".
Doing a quick grep for that string shows it in one location.

![RadioOfWEPEncryWay]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_2_img/RadioOfWEPEncryWay.png)

Knowing what the pseudo code does and where the string is used we can assume that
the returned string "checked" or "" will be used to set the radio buttons on the
wireless.htm page. We also know that if wireless.htm is requested with WEPEncryption
in the URL it should copy that string directly to the stack. There's a little bit
of handwaving going on here, but I did look through a lot of disassembly to figure
out that websParaDefine function correlates the strings between %% and an associated
processing function. All this together if we have a request that looks something
like this:

```
http://IP:PORT/wireless.htm?WEPEncryption=AAAAAAAAAAAAAAAAA
```
Those 'A's should end up on the functions stack.

## Conclusion
I cherry picked some nice examples for the purpose of this post, but the reality
is that most of the potential vulnerabilities you look at are pretty complicated
and take a long time to figure out what's going on, at least for me. A good rule
of thumb I follow: if it looks complicated to execute the code path then skip it.
Have I missed vulnerabilities because of this rule? Probably, but I'm all about
that low to middle of the tree hanging fruit. Anyway, we have identified a
potentially user controlled buffer overflow. Next time we'll dive in to how to
emulate the server to find out if we can call this function and crash it.
