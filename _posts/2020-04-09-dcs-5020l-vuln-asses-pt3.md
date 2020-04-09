---
layout: post
title:  "D-Link DCS-5020L Vuln Assessment Pt. 3"
date:   2020-04-09 16:44:11 -0400
categories: exploits
---

# Emulation

## The Sploit
In part 2 of the assessment we discovered a potential overflow in the 
administration server, `alphapd`. It appears if you send a long string in the 
`WEPEncryption` field to `wireless.htm` that it can cause a buffer overflow. At 
this point we still don't want to buy the camera because, remember, we are broke
hackers. Even if we were rich hackers we still don't want to waste money on a 
maybe. We want to prove its exploitable before moving to the real thing. So, 
how do we prove it? Emulation. Emulation is how we prove it.

## Easy(ish) Mode Emulation
Being a programmer for a few years before looking for exploits I like to find 
the easiest path for completing tasks. The easiest way (usually) to quickly 
emulate binaries that don't match the architecture of our machine is to use
[QEMU](https://www.qemu.org/) which stands for Quick Emulator. QEMU supports a 
ton of architectures including the one we need, MIPS, and it's pretty simple to 
use. However, we can't just throw the QEMU binary at `alphapd` and expect it to 
run like nothing is wrong. The device performs a few minutes worth of setup 
before running `alphapd` and we have literally done nothing. That will likely 
cause some problems. 

We also need to change our root directory so when `alphapd` runs it will use the
libraries in the firmware as opposed to our local libraries. Enter the 
[chroot](https://en.wikipedia.org/wiki/Chroot) command. Chroot will sandbox our 
command to a specified directory essentially making it the root directory for 
that command. Since we are changing the root to the firmwares directory we also 
need a statically linked version of QEMU copied into the root of the firmware. 
Running the [file](http://man7.org/linux/man-pages/man1/file.1.html) command 
will tell us the architecture so we know which version of QEMU to grab. 

![QEMU Setup]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/dir_listing.png)

The giant MIPS tells us its.... MIPS. The LSB, or least-significant byte, 
indicates it is little endian. From there we can chroot and run `alphapd`!

![First attempt]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/first_qemu.png)

And immediately fail. But this is expected behavior. We jumped right to
running a server on a system that expected some setup to have been performed 
and none of that happened. Some missing file and missing directory errors are 
expected. So we just run the server and keep fixing errors as they come up. 
Some of the errors, like the one we see now `alphapd: cannot open pid file` will
require looking at the disassembly and tracing the errors back to their source. 
In this case a missing file.

![Missing PID File]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/pid_file.png)

Very early in main the server attempts to open `/var/run/alphapd.pid` and the 
`run` directory does not exist. So we can just create that directory as well as 
the PID file for good measure. The next error is a little more disgusting and 
would fit well in its own blog post. `please execute nvram_daemon first`

![Missing NVRAM Daemon]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/nvram_daemon.png)

The server is waiting for the NVRAM daemon to start which will never happen 
because it's backed by hardware and we are emulating. The only option we have 
is to emulate NVRAM as well. I used a forked version of a tool called nvram-faker. 
Original is found [here](https://github.com/zcutlip/nvram-faker), my forked and 
updated version found [here](https://github.com/fuzzywalls/nvram-faker). This 
tool compiles to a library that is meant to expose functionality with the same 
prototype the server is expecting of its NVRAM function calls. Instead of the 
real call being executed and calling out to hardware our calls will return 
prefabbed data from a file. But how do we make `alphapd` use our calls instead of 
the real calls? Easy. There's a handy Linux environment variable,
[LD_PRELOAD](https://blog.fpmurphy.com/2012/09/all-about-ld_preload.html), that
 allows for specifying libraries to be loaded before any others. Preloading it 
 means that its functions will be used before others of the same prototype in 
 later libraries. Most difficult part of this whole processes is compiling the 
 nvram-faker library with the same, or similar enough, toolchain so it will run. 
 It's not unusal to have to try different toolchains and you might need to copy 
 over some libraries from that toolchain to the firmware's lib directory. 
 Luckily, I have one that is close enough, but I did need to copy a few libs 
 from the toolchain. On top of LD_PRELOADing nvram-faker we also need to create 
 a PID file for the non-existant NVRAM daemon.

![alphapd running]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/alphapd_running.png)

Now it's running but it quickly crashes because it didn't find a valid value for
a variable it requested from NVRAM. We need to find the values that NVRAM is 
loading by default from the factory. These values usually exist somewhere in the
file system, just takes a little searching. The nvram-faker library provides 
logging output each time a value is accessed so we know exactly what values the 
binary is expecting and we can search for one of these in the unpacked firmware.

![NVRAM Default Data]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/nvram_file.png)

That directory contains everything we need to populate a file that nvram-faker 
can parse and use to return values. Once that is all sorted we can emulate the 
server and try requesting the main page. Because we are running a local QEMU a 
request to `http://127.0.0.1` be sent directly to `alphapd`. Upon making the 
request it actually returns a page which is awesome. That wasn't so hard, right?

![alphapd index]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/alphapd_index.png)

## Triggering the Exploit
The server is more or less running now. We can make requests and it will send 
responses letting us navigate around the cameras configuration pages. So.....
what happens if we try and trigger our exploit?

![Sending the exploit via Firefox]({{site.baseurl}}/assets/images/dcs-5020l//dcs-5020L_3_img/exploit_sent.png)

Hmm. Unable to connect. That kinda unfortunate. Did we type something wrong? 
Does that page not exist? Going back to the terminal that `alphapd` was run 
from we see some pretty interesting output that indicates maybe it actually worked.

![Segmentation Fault]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/segmentation_fault.png)

Seems like `alphapd` actually crashed when it tried to process that URL which 
is really good news. This could indicate that we overflowed the stack and 
jumped to address 0x41414141 (AAAA). Only one way to find out, we need to 
debug the server and see for sure. QEMU has a handy option (-g) that runs a GDB 
server and waits for a connection. Once it is waiting we can use IDA to connect 
and interactively step through the server while it's processing the URL we sent. 
The part we care about is the epilogue of the function that our overflow 
occurred in. The epilogue will restore the saved register, frame pointer, stack 
pointer, global pointer, and return address to their values before this function 
was called. These values are restored directly from the stack, which if things 
have gone our way should be full of 'A's and they are.

![Overflowed Registers]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/registers.png)

## Full System Emulation
We need to take this emulation one step further before we can declare this an 
absolute win. All this emulation was performed on an Intel system. When `alphapd`
tries to execute a system call it will fork to execute the desired task which 
takes it outside of our QEMU MIPS sandboxed environment. When the system call 
tries to execute outside of the sandboxed environment it will be attempting 
to run a MIPS binary on an Intel system which will fail every time. Our next 
step is to emulate the full system so when the server tries to execute other 
programs they will succeed. This could result in some undesired behavior for us,
but we need to know if it does. To perform full system emulation we need a 
virtual machine (VM) that matches the targets architecture. Building a VM is an
in-depth process so I'm not going to go through it, but 
[here's a link](https://markuta.com/how-to-build-a-mips-qemu-image-on-debian/) 
that explains how to build a MIPS Debian VM with a newer kernel. Once 
everything is up and running in a full system emulation environment the biggest 
difference we see is `alphapd` now requests a password when logging in which makes 
this, at minimum, an authenticated exploit.

![Alphapd Login Page]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/login.png)

The next hurdle is that we are forbidden from requesting wireless.htm even after authenticating.

![Forbidden Request]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/forbidden.png)

But, if we navigate to wireless.htm through the GUI everything is fine. What's 
the difference? Using Firefox's Web Developer Tools to look at the requests 
sent to the server the only difference is the lack of a referer field in the 
first request. Using the Developer Tools again to edit the working request to 
add WEPEncryption allowed for sending the request and it crashed the server again.

![FF Developer Tools]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_3_img/request.png)

## Conclusion
Through the power of emulation we have proven the `strcpy` is vulnerable and it
can be triggered by a request to the server. So far it's been completely free 
to validate. Next time we are going to fully put on our hacking caps by writing 
a ROP chain to exploit this vulnerability and make magic happen.
