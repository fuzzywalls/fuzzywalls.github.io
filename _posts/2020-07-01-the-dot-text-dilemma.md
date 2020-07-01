---
layout: post
title:  "The .text Dilemma"
date:   2020-07-01 00:00:00 -0400
comments: true
categories: exploitation techniques
---

# The .text Dilemma 
Lately I find myself writing a lot of code to exploit MIPS buffer overflows. Each one is different and frustrating in it's own little way, but fun none the less. I usually write a small ROP gadget that will call system with a command I pass on the stack, but occasionally I find the perfect function in the .text section that does everything I need. Typically it's a leftover debug function that has no path for a user to call, but performs an operation that would be useful. In the case of this router it's named `debug` and starts an unauthenticated telnetd server.

![debug function]({{site.baseurl}}/assets/images/text_dilemma/debug.png)

In the world of MIPS exploitation, to execute this function the return address (`$ra`) needs to contain 0x0040a168 when `jr $ra` is executed at the end of the function containing the buffer overflow. `$ra` is saved on the stack at the beginning of the function and restored from the stack at the end of the function. We gain control of it by overflowing a buffer on the stack and writing enough data to overwrite the saved register value. An overflow occurs when an unsafe function is used, `strcpy`, `strcat`, `sprintf`, etc. They are considered unsafe because they  stop when a NULL byte is encountered in the source string as opposed to stopping at a predefined max length. The address of the function we want to execute, 0x0040a168, has a NULL byte in the address. Depending on the endianness of our target this will be a problem because it will prematurely stop the overflow.

# Little Endian
The little endian solution is a very simple one. Just use the address as is. Little endian addressing means the address `0x0040a168` is represented as `68 a1 40 00` in memory. Our overflow would look something like this:

	AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\x68\xa1\x40\x00

The string operation would perform its intended operation until it encounters the NULL byte at the end of our overflow meaning `$ra` would be set to 0x0040a168. The overflow would work as expected and we would jump to 0x0040a168 to execute the `debug` function.

# Big Endian 
Big endian on the other hand is not as straight forward. The address `0x0040a168` would be represented in memory in the same order, `00 40 a1 68`, meaning our overflow would look like this:

	AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\x00\x40\xa1\x68
	
Remember that the overflow will stop when it encounters a NULL byte? That prevents us from overwriting the return address with the full address and instead only overwrites the high byte with NULL. One solution to get around this requires multiple exploits in the same function. The first exploit writes the overflow in the same fashion, but instead of including the 0x00 byte it replaces it with a trash byte like 0xFF:

	AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\xFF\x40\xa1\x68
	
The second exploit overflows until the 0xFF byte which results it the 0xFF being overwritten with 0x00:

	AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\x00\x40\xa1\x68
	
The saved return address now holds the address of `debug`. It's rare enough to find one exploit in a function let alone two so this option is not very reliable. 

# My Big Endian Solution
Instead of hoping for multiple exploits in one function I came up with a simple way to jump back to the .text section in MIPS big endian routers. I assume this isn't a new technique, but it's new to me and I wanted to share. The technique requires two ROP gadgets, potentially one if you are lucky. The first ROP gadget abuses the `addu` operation to fix up the address of the function we want to call in the .text section. A simple gadget would look like this:
	
	addu 	$s1, $s0, $s2
	move 	$t9, $s7
	jalr 	$t9
		
`addu` is the operation to perform unsigned addition. The perk of it being an unsigned operation means there is no exception raised when an overflow occurs. If, for example, `$s0 = 0xFF2F9057` and `s1 = 0x01111111` then adding them together equals `0x10040a168`. The registers can only hold 4 bytes (32 bits) so the upper 1 is dropped leaving `$s1 = 0x0040a168`. Now we only need one gadget to move `$s1` to `$t9` and call it, which is easy to find.

# Conclusion
I thought this was an interesting way to call functions in the .text section of big endian MIPS routers and I assume it would work on other architectures that support unsigned addition as well. This isn't my "go to" exploitation strategy but it's a nice tool to have if the need ever arises. 

